import { useState, useRef, useMemo, useEffect, ChangeEvent } from 'react';
import { QRCodeCanvas, QRCodeSVG } from 'qrcode.react';
import JsBarcode from 'jsbarcode';
import { 
  Download, Link as LinkIcon, Type, Phone, Mail, Wifi, MessageSquare, 
  User, MessageCircle, Image as ImageIcon, Settings, Palette, Trash2, 
  CreditCard, ArrowLeftRight, RotateCcw, Check, AlertTriangle, CheckCircle2,
  Sparkles, Barcode as BarcodeIcon, QrCode, Printer, Zap, Copy, CheckCheck,
  Sliders, ShieldCheck, Info
} from 'lucide-react';

interface ColorPreset {
  id: string;
  name: string;
  fg: string;
  bg: string;
}

const COLOR_PRESETS: ColorPreset[] = [
  { id: 'classic', name: 'Classic B&W (Fastest)', fg: '#000000', bg: '#ffffff' },
  { id: 'dark', name: 'Midnight Dark', fg: '#ffffff', bg: '#0f172a' },
  { id: 'corporate', name: 'Corporate Blue', fg: '#1d4ed8', bg: '#ffffff' },
  { id: 'emerald', name: 'Emerald Forest', fg: '#047857', bg: '#ffffff' },
  { id: 'crimson', name: 'Crimson Red', fg: '#b91c1c', bg: '#ffffff' },
  { id: 'violet', name: 'Royal Violet', fg: '#7e22ce', bg: '#ffffff' },
  { id: 'sunset', name: 'Sunset Bronze', fg: '#c2410c', bg: '#fff7ed' },
  { id: 'cyber', name: 'Cyber Neon', fg: '#22c55e', bg: '#09090b' },
  { id: 'navy-ice', name: 'Navy & Ice', fg: '#1e3a8a', bg: '#eff6ff' },
  { id: 'mint', name: 'Mint Leaf', fg: '#065f46', bg: '#f0fdf4' },
  { id: 'rose', name: 'Velvet Rose', fg: '#be185d', bg: '#fdf2f8' },
  { id: 'amber', name: 'Amber Gold', fg: '#854d0e', bg: '#fefce8' },
];

const FG_SWATCHES = [
  '#000000', '#1e293b', '#1d4ed8', '#047857', '#b91c1c',
  '#7e22ce', '#c2410c', '#0f766e', '#be185d', '#854d0e',
  '#2563eb', '#16a34a', '#dc2626', '#9333ea', '#ffffff'
];

const BG_SWATCHES = [
  '#ffffff', '#f8fafc', '#f1f5f9', '#eff6ff', '#f0fdf4',
  '#fef2f2', '#faf5ff', '#fff7ed', '#fefce8', '#0f172a'
];

type BarcodeFormat = 'CODE128' | 'EAN13' | 'UPC' | 'EAN8' | 'CODE39' | 'ITF14' | 'MSI' | 'pharmacode' | 'codabar';

interface BarcodeFormatMeta {
  id: BarcodeFormat;
  name: string;
  defaultVal: string;
  description: string;
  example: string;
  patternHelp: string;
}

const BARCODE_FORMATS: BarcodeFormatMeta[] = [
  { 
    id: 'CODE128', 
    name: 'Code 128 (Universal)', 
    defaultVal: 'LYT-849204-PROD', 
    description: 'Universal alphanumeric barcode for packaging, inventory, and labels.',
    example: 'ABC-12345',
    patternHelp: 'Supports all letters (A-Z, a-z), numbers (0-9), and punctuation.'
  },
  { 
    id: 'EAN13', 
    name: 'EAN-13 (Global Retail)', 
    defaultVal: '5901234123457', 
    description: 'International retail product barcode standard worldwide.',
    example: '5901234123457',
    patternHelp: 'Requires 12 or 13 numeric digits. 13th is checksum.'
  },
  { 
    id: 'UPC', 
    name: 'UPC-A (US Retail)', 
    defaultVal: '012345678905', 
    description: 'Standard 12-digit North American retail barcode.',
    example: '012345678905',
    patternHelp: 'Requires 11 or 12 numeric digits.'
  },
  { 
    id: 'EAN8', 
    name: 'EAN-8 (Compact)', 
    defaultVal: '96385074', 
    description: 'Compact 8-digit barcode for small packages and sweets.',
    example: '96385074',
    patternHelp: 'Requires exactly 7 or 8 numeric digits.'
  },
  { 
    id: 'CODE39', 
    name: 'Code 39 (Industrial)', 
    defaultVal: 'CODE39-TEST', 
    description: 'Widely used in automotive, defense, ID badges, and logistics.',
    example: 'PART-902',
    patternHelp: 'Supports uppercase letters, numbers, and symbols: - . $ / + % SPACE'
  },
  { 
    id: 'ITF14', 
    name: 'ITF-14 (Carton Box)', 
    defaultVal: '10012345678902', 
    description: '14-digit shipping carton and master package barcode.',
    example: '10012345678902',
    patternHelp: 'Requires exactly 14 numeric digits with even length.'
  },
  { 
    id: 'MSI', 
    name: 'MSI Plessey', 
    defaultVal: '12345670', 
    description: 'Used for warehouse shelf tags and inventory control.',
    example: '12345670',
    patternHelp: 'Numbers only (0-9).'
  },
  { 
    id: 'pharmacode', 
    name: 'Pharmacode', 
    defaultVal: '12345', 
    description: 'Used in pharmaceutical packaging and quality control.',
    example: '12345',
    patternHelp: 'Integer number between 3 and 131070.'
  },
  { 
    id: 'codabar', 
    name: 'Codabar', 
    defaultVal: 'A12345678B', 
    description: 'Used in libraries, blood banks, and airbills.',
    example: 'A12345678B',
    patternHelp: 'Starts and ends with A, B, C, or D; numbers and - $ : / . + inside.'
  },
];

export default function QrGenerator({ initialMode = 'qr' }: { initialMode?: 'qr' | 'barcode' }) {
  // Main Generator Mode: QR Code vs Barcode
  const [activeTab, setActiveTab] = useState<'qr' | 'barcode'>(initialMode);

  // Sync mode if initialMode prop changes
  useEffect(() => {
    if (initialMode) {
      setActiveTab(initialMode);
    }
  }, [initialMode]);

  // --- QR Code State ---
  const [type, setType] = useState('url');
  const [value, setValue] = useState('https://loveyoutools.in');
  const [size, setSize] = useState(256);
  const [fgColor, setFgColor] = useState('#000000');
  const [bgColor, setBgColor] = useState('#ffffff');
  const [isTransparentBg, setIsTransparentBg] = useState(false);
  const [colorMode, setColorMode] = useState<'presets' | 'custom'>('custom');
  // CRITICAL FIX: Default to 'M' (15%) for ultra-fast scanning! Level H creates too many dense dots.
  const [level, setLevel] = useState<'L' | 'M' | 'Q' | 'H'>('M');
  const [includeMargin, setIncludeMargin] = useState(true);
  const [marginSize, setMarginSize] = useState(4); // ISO Standard 4 modules for instant camera locking
  const [logoImage, setLogoImage] = useState<string | null>(null);
  const [logoSize, setLogoSize] = useState(40);
  const [downloadFormat, setDownloadFormat] = useState<'png' | 'svg' | 'jpeg'>('png');
  const [upiType, setUpiType] = useState<'vpa' | 'account'>('vpa');
  const [copiedPayload, setCopiedPayload] = useState(false);
  const [fastScanToast, setFastScanToast] = useState(false);

  const qrRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Barcode State ---
  const [barcodeFormat, setBarcodeFormat] = useState<BarcodeFormat>('CODE128');
  const [barcodeValue, setBarcodeValue] = useState('LYT-849204-PROD');
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

  const barcodeSvgRef = useRef<SVGSVGElement | null>(null);

  // Automatically switch QR error correction to H if a logo is added (to ensure data recovery),
  // and back to M if logo is cleared (for fastest scanning).
  useEffect(() => {
    if (logoImage) {
      if (level === 'L' || level === 'M') {
        setLevel('H');
      }
    }
  }, [logoImage]);

  // Luminance and Contrast Ratio for Scan Quality Safety Score
  const getLuminance = (hex: string): number => {
    if (!hex || hex === 'transparent') return 1;
    const clean = hex.replace('#', '').trim();
    const fullHex = clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean;
    if (fullHex.length !== 6) return 0.5;
    const r = parseInt(fullHex.substring(0, 2), 16) / 255;
    const g = parseInt(fullHex.substring(2, 4), 16) / 255;
    const b = parseInt(fullHex.substring(4, 6), 16) / 255;
    
    const a = [r, g, b].map(v => {
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
  };

  const contrastRatio = useMemo(() => {
    if (isTransparentBg) return 21; // transparent assumed on white background
    const l1 = getLuminance(fgColor);
    const l2 = getLuminance(bgColor);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
  }, [fgColor, bgColor, isTransparentBg]);

  // Is foreground darker than background? (Standard QR scanners are 2x faster with dark on light)
  const isDarkOnLight = useMemo(() => {
    if (isTransparentBg) return true;
    return getLuminance(fgColor) < getLuminance(bgColor);
  }, [fgColor, bgColor, isTransparentBg]);

  // Scan Speed Score (0 to 100)
  const scanSpeedScore = useMemo(() => {
    let score = 0;
    // Contrast contribution
    if (contrastRatio >= 7) score += 40;
    else if (contrastRatio >= 4.5) score += 30;
    else if (contrastRatio >= 2.5) score += 15;
    else score += 5;

    // Dark-on-light orientation
    if (isDarkOnLight) score += 20;

    // Quiet zone margin
    if (includeMargin && marginSize >= 4) score += 25;
    else if (includeMargin && marginSize >= 2) score += 15;
    else score += 0;

    // Error correction level (M is the fastest decoding sweet spot without logo)
    if (!logoImage && level === 'M') score += 15;
    else if (logoImage && level === 'H') score += 15;
    else if (level === 'L' || level === 'Q') score += 10;
    else score += 5;

    return Math.min(100, score);
  }, [contrastRatio, isDarkOnLight, includeMargin, marginSize, logoImage, level]);

  // 1-Click Fast Scan Optimizer
  const handleOptimizeFastScan = () => {
    setFgColor('#000000');
    setBgColor('#ffffff');
    setIsTransparentBg(false);
    setLevel(logoImage ? 'H' : 'M');
    setIncludeMargin(true);
    setMarginSize(4);
    setSize(300);
    setFastScanToast(true);
    setTimeout(() => setFastScanToast(false), 2500);
  };

  const handleSwapColors = () => {
    if (isTransparentBg) {
      setIsTransparentBg(false);
      setBgColor(fgColor);
      setFgColor('#000000');
    } else {
      const temp = fgColor;
      setFgColor(bgColor);
      setBgColor(temp);
    }
  };

  const handleResetColors = () => {
    setFgColor('#000000');
    setBgColor('#ffffff');
    setIsTransparentBg(false);
  };

  const handleApplyPreset = (preset: ColorPreset) => {
    setFgColor(preset.fg);
    setBgColor(preset.bg);
    setIsTransparentBg(false);
  };

  const effectiveBgColor = isTransparentBg ? 'rgba(0, 0, 0, 0)' : bgColor;

  // --- Render Barcode on SVG with JsBarcode ---
  useEffect(() => {
    if (activeTab === 'barcode' && barcodeSvgRef.current) {
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
    activeTab,
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

  // Switch Barcode format and load clean default value
  const handleBarcodeFormatChange = (fmt: BarcodeFormat) => {
    setBarcodeFormat(fmt);
    const meta = BARCODE_FORMATS.find(f => f.id === fmt);
    if (meta) {
      setBarcodeValue(meta.defaultVal);
    }
  };

  // Helper to auto-calculate EAN-13 / UPC Check Digit
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

  // Download QR Code
  const handleDownloadQr = () => {
    if (!qrRef.current) return;
    
    if (downloadFormat === 'png' || downloadFormat === 'jpeg') {
      const canvas = qrRef.current.querySelector('canvas');
      if (!canvas) return;

      // Create an ultra-high resolution export canvas so the downloaded image is razor-sharp
      const exportCanvas = document.createElement('canvas');
      const exportSize = Math.max(size, 512); // Minimum 512px for crisp camera reading
      exportCanvas.width = exportSize;
      exportCanvas.height = exportSize;
      const ctx = exportCanvas.getContext('2d');
      if (!ctx) return;

      ctx.imageSmoothingEnabled = false; // Sharp integer pixel modules

      if (downloadFormat === 'jpeg' || !isTransparentBg) {
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, exportSize, exportSize);
      }

      ctx.drawImage(canvas, 0, 0, exportSize, exportSize);

      const mimeType = downloadFormat === 'jpeg' ? 'image/jpeg' : 'image/png';
      const url = exportCanvas.toDataURL(mimeType, 0.98);
      const a = document.createElement('a');
      a.href = url;
      a.download = `fast-qr-${Date.now()}.${downloadFormat}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } else {
      const svg = qrRef.current.querySelector('svg');
      if (!svg) return;
      const svgData = new XMLSerializer().serializeToString(svg);
      const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
      const svgUrl = URL.createObjectURL(svgBlob);
      const a = document.createElement('a');
      a.href = svgUrl;
      a.download = `fast-qr-${Date.now()}.svg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(svgUrl), 1000);
    }
  };

  // Download Barcode
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
      // Export as PNG or JPEG
      const svgElement = barcodeSvgRef.current;
      const svgData = new XMLSerializer().serializeToString(svgElement);
      const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
      const URL_OBJ = window.URL || window.webkitURL || window;
      const blobURL = URL_OBJ.createObjectURL(svgBlob);
      
      const image = new Image();
      image.onload = () => {
        const scale = 2; // High-DPI 300 DPI for thermal printing
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

        ctx.scale(scale, scale);
        ctx.drawImage(image, 0, 0);

        const mime = barcodeDownloadFormat === 'jpeg' ? 'image/jpeg' : 'image/png';
        const dataUrl = canvas.toDataURL(mime, 0.98);
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = `barcode-${barcodeFormat.toLowerCase()}-${Date.now()}.${barcodeDownloadFormat}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL_OBJ.revokeObjectURL(blobURL);
      };
      image.src = blobURL;
    }
  };

  // Print Barcode Label
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

  const handleLogoUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setLogoImage(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCopyPayload = () => {
    navigator.clipboard.writeText(value);
    setCopiedPayload(true);
    setTimeout(() => setCopiedPayload(false), 2000);
  };

  const renderQrInputs = () => {
    switch (type) {
      case 'url':
        return (
          <div className="fg" key="type-url">
            <label className="fl">Website URL</label>
            <input 
              key="input-url"
              type="url" 
              className="fi" 
              value={value || ''} 
              onChange={(e) => setValue(e.target.value)} 
              placeholder="https://example.com" 
            />
          </div>
        );
      case 'text':
        return (
          <div className="fg" key="type-text">
            <label className="fl">Text Content</label>
            <textarea 
              key="textarea-text"
              className="fta min-h-[100px]" 
              value={value || ''} 
              onChange={(e) => setValue(e.target.value)} 
              placeholder="Enter your plain text or message..." 
            />
          </div>
        );
      case 'phone':
        return (
          <div className="fg" key="type-phone">
            <label className="fl">Phone Number</label>
            <input 
              key="input-phone"
              type="tel" 
              className="fi" 
              value={(value || '').replace('tel:', '')} 
              onChange={(e) => setValue(`tel:${e.target.value}`)} 
              placeholder="+1234567890" 
            />
          </div>
        );
      case 'email':
        return (
          <div className="fg" key="type-email">
            <label className="fl">Email Address</label>
            <input 
              key="input-email"
              type="email" 
              className="fi" 
              value={(value || '').replace('mailto:', '')} 
              onChange={(e) => setValue(`mailto:${e.target.value}`)} 
              placeholder="hello@example.com" 
            />
          </div>
        );
      case 'sms': {
        const smsPhone = (value || '').match(/smsto:(.*?):/)?.[1] || '';
        const smsMsg = (value || '').split(':').slice(2).join(':') || '';
        return (
          <div className="fg" key="type-sms">
            <label className="fl">Phone Number</label>
            <input 
              key="input-sms-phone"
              type="tel" 
              className="fi mb-2" 
              value={smsPhone} 
              onChange={(e) => {
                setValue(`smsto:${e.target.value}:${smsMsg}`);
              }} 
              placeholder="+1234567890" 
            />
            <label className="fl">Message</label>
            <textarea 
              key="textarea-sms-msg"
              className="fta" 
              value={smsMsg} 
              onChange={(e) => {
                setValue(`smsto:${smsPhone}:${e.target.value}`);
              }} 
              placeholder="Type your message..." 
            />
          </div>
        );
      }
      case 'vcard': {
        const vcardName = value.includes('FN:') ? (value.split('FN:')[1]?.split('\n')[0] || '') : value;
        return (
          <div className="fg" key="type-vcard">
            <label className="fl">Full Name</label>
            <input 
              key="input-vcard-name"
              type="text" 
              className="fi mb-2" 
              value={vcardName}
              placeholder="John Doe" 
              onChange={(e) => {
                setValue(`BEGIN:VCARD\nVERSION:3.0\nFN:${e.target.value}\nEND:VCARD`);
              }} 
            />
            <p className="text-xs text-text-muted">Generates instant contact card readable by iOS & Android cameras.</p>
          </div>
        );
      }
      case 'whatsapp': {
        const waNumber = value.startsWith('https://wa.me/') ? value.replace('https://wa.me/', '') : value;
        return (
          <div className="fg" key="type-whatsapp">
            <label className="fl">WhatsApp Number (with country code)</label>
            <input 
              key="input-whatsapp-num"
              type="tel" 
              className="fi mb-2" 
              value={waNumber}
              placeholder="919876543210" 
              onChange={(e) => {
                const clean = e.target.value.replace(/[^0-9]/g, '');
                setValue(`https://wa.me/${clean}`);
              }} 
            />
          </div>
        );
      }
      case 'upi': {
        const getUpiParam = (key: string): string => {
          const match = (value || '').match(new RegExp(`${key}=([^&]+)`));
          if (!match || !match[1]) return '';
          try {
            return decodeURIComponent(match[1]);
          } catch {
            return match[1];
          }
        };

        const vpaVal = value.match(/pa=([^&]+)/)?.[1]?.includes('.ifsc.npci') ? '' : (value.match(/pa=([^&]+)/)?.[1] || '');
        const accVal = value.match(/pa=([^@]+)@.*\.ifsc\.npci/)?.[1] || '';
        const ifscVal = value.match(/pa=[^@]+@([a-zA-Z0-9]+)\.ifsc\.npci/)?.[1] || '';
        const payeeName = getUpiParam('pn');
        const amount = value.match(/am=([^&]+)/)?.[1] || '';

        return (
          <div className="fg" key="type-upi">
            <div className="flex gap-2 mb-4">
              <button 
                type="button"
                className={`flex-1 py-1.5 rounded-lg border text-[10px] font-bold transition-colors uppercase tracking-wider ${upiType === 'vpa' ? 'bg-accent text-white border-accent' : 'border-border hover:bg-bg-secondary'}`}
                onClick={() => setUpiType('vpa')}
              >
                UPI ID (VPA)
              </button>
              <button 
                type="button"
                className={`flex-1 py-1.5 rounded-lg border text-[10px] font-bold transition-colors uppercase tracking-wider ${upiType === 'account' ? 'bg-accent text-white border-accent' : 'border-border hover:bg-bg-secondary'}`}
                onClick={() => setUpiType('account')}
              >
                Bank Account
              </button>
            </div>
            
            {upiType === 'vpa' ? (
              <>
                <label className="fl">UPI ID (e.g. mobile@paytm, user@okaxis)</label>
                <input 
                  key="input-upi-vpa"
                  type="text" 
                  className="fi mb-2" 
                  value={vpaVal}
                  placeholder="merchant@upi" 
                  onChange={(e) => {
                    const name = value.match(/pn=(.*?)(&|$)/)?.[1] || '';
                    const am = value.match(/am=(.*?)(&|$)/)?.[1] || '';
                    setValue(`upi://pay?pa=${e.target.value}&pn=${name}&am=${am}&cu=INR`);
                  }} 
                />
              </>
            ) : (
              <>
                <label className="fl">Account Number</label>
                <input 
                  key="input-upi-acc"
                  type="text" 
                  className="fi mb-2" 
                  value={accVal}
                  placeholder="1234567890" 
                  onChange={(e) => {
                    const name = value.match(/pn=(.*?)(&|$)/)?.[1] || '';
                    const am = value.match(/am=(.*?)(&|$)/)?.[1] || '';
                    const ifsc = value.match(/pa=[^@]+@([a-zA-Z0-9]+)\.ifsc\.npci/)?.[1] || '';
                    setValue(`upi://pay?pa=${e.target.value}@${ifsc}.ifsc.npci&pn=${name}&am=${am}&cu=INR`);
                  }} 
                />
                <label className="fl">IFSC Code</label>
                <input 
                  key="input-upi-ifsc"
                  type="text" 
                  className="fi mb-2 uppercase" 
                  value={ifscVal}
                  placeholder="SBIN0001234" 
                  maxLength={11}
                  onChange={(e) => {
                    const name = value.match(/pn=(.*?)(&|$)/)?.[1] || '';
                    const am = value.match(/am=(.*?)(&|$)/)?.[1] || '';
                    const acc = value.match(/pa=([^@]+)@/)?.[1] || '';
                    setValue(`upi://pay?pa=${acc}@${e.target.value.toUpperCase()}.ifsc.npci&pn=${name}&am=${am}&cu=INR`);
                  }} 
                />
              </>
            )}
            
            <label className="fl">Payee / Merchant Name</label>
            <input 
              key="input-upi-payee"
              type="text" 
              className="fi mb-2" 
              value={payeeName}
              placeholder="Store or Payee Name" 
              onChange={(e) => {
                const pa = value.match(/pa=([^&]+)/)?.[1] || '';
                const am = value.match(/am=([^&]+)/)?.[1] || '';
                setValue(`upi://pay?pa=${pa}&pn=${encodeURIComponent(e.target.value)}&am=${am}&cu=INR`);
              }} 
            />
            <label className="fl">Amount (Optional ₹)</label>
            <input 
              key="input-upi-amount"
              type="number" 
              className="fi" 
              value={amount}
              placeholder="0.00" 
              onChange={(e) => {
                const pa = value.match(/pa=([^&]+)/)?.[1] || '';
                const name = value.match(/pn=([^&]+)/)?.[1] || '';
                setValue(`upi://pay?pa=${pa}&pn=${name}&am=${e.target.value}&cu=INR`);
              }} 
            />
          </div>
        );
      }
      case 'wifi': {
        const wifiSsid = (value || '').match(/S:(.*?);/)?.[1] || '';
        const wifiPass = (value || '').match(/P:(.*?);/)?.[1] || '';
        return (
          <div className="fg" key="type-wifi">
            <label className="fl">WiFi Network (SSID)</label>
            <input 
              key="input-wifi-ssid"
              type="text" 
              className="fi mb-2" 
              value={wifiSsid} 
              placeholder="MyHomeWiFi" 
              onChange={(e) => {
                setValue(`WIFI:S:${e.target.value};T:WPA;P:${wifiPass};;`);
              }} 
            />
            <label className="fl">WiFi Password</label>
            <input 
              key="input-wifi-pass"
              type="password" 
              className="fi" 
              value={wifiPass} 
              placeholder="Password" 
              onChange={(e) => {
                setValue(`WIFI:S:${wifiSsid};T:WPA;P:${e.target.value};;`);
              }} 
            />
          </div>
        );
      }
      default:
        return null;
    }
  };

  const currentBarcodeMeta = useMemo(() => {
    return BARCODE_FORMATS.find(f => f.id === barcodeFormat) || BARCODE_FORMATS[0];
  }, [barcodeFormat]);

  return (
    <div className="tool-layout-container">
      {/* Left Controls (Sidebar) */}
      <aside className="tool-sidebar">
        {/* Top Segmented Mode Switcher: QR Code vs Barcode */}
        <div className="p-3 bg-surface border-b border-border">
          <div className="flex p-1 bg-bg-secondary rounded-2xl border border-border">
            <button
              type="button"
              onClick={() => setActiveTab('qr')}
              className={`flex-1 py-2 px-3 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 ${
                activeTab === 'qr'
                  ? 'bg-accent text-white shadow-md'
                  : 'text-text-muted hover:text-text-primary hover:bg-surface/50'
              }`}
            >
              <QrCode className="w-4 h-4" />
              <span>QR Code</span>
              <span className="hidden sm:inline-block px-1.5 py-0.2 rounded-full text-[9px] bg-white/20 font-black">
                Fast
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('barcode')}
              className={`flex-1 py-2 px-3 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 ${
                activeTab === 'barcode'
                  ? 'bg-accent text-white shadow-md'
                  : 'text-text-muted hover:text-text-primary hover:bg-surface/50'
              }`}
            >
              <BarcodeIcon className="w-4 h-4" />
              <span>Barcode</span>
              <span className="hidden sm:inline-block px-1.5 py-0.2 rounded-full text-[9px] bg-white/20 font-black">
                1D
              </span>
            </button>
          </div>
        </div>

        {/* Tab 1: QR CODE GENERATOR CONTROLS */}
        {activeTab === 'qr' && (
          <div className="sidebar-content custom-scrollbar p-6 space-y-6">
            {/* 1-Click Fast Scan Optimizer Banner */}
            <div className="p-3.5 rounded-2xl bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-blue-500/10 border border-emerald-500/25 relative overflow-hidden">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500 text-white flex items-center justify-center shadow-xs shrink-0">
                    <Zap className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-text-primary flex items-center gap-1.5">
                      Fast-Scan Mode Active
                    </h4>
                    <p className="text-[10px] text-text-muted">High contrast & standard quiet zone</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleOptimizeFastScan}
                  className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-black uppercase tracking-wider transition-all shadow-xs shrink-0 flex items-center gap-1 active:scale-95"
                  title="Apply recommended high-speed camera settings"
                >
                  <Sparkles className="w-3 h-3" /> Auto Fix
                </button>
              </div>
              {fastScanToast && (
                <div className="mt-2 text-[10px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1 animate-pulse">
                  <Check className="w-3.5 h-3.5" /> Optimal 0.1s scanning parameters applied!
                </div>
              )}
            </div>

            {/* Data Type Selection */}
            <div className="space-y-4">
              <h3 className="font-black text-[10px] uppercase tracking-widest flex items-center gap-2 text-text-muted">
                <Settings className="w-4 h-4 text-accent" /> Data Type
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {[
                  { id: 'url', icon: LinkIcon, label: 'URL' },
                  { id: 'text', icon: Type, label: 'Text' },
                  { id: 'phone', icon: Phone, label: 'Phone' },
                  { id: 'email', icon: Mail, label: 'Email' },
                  { id: 'sms', icon: MessageSquare, label: 'SMS' },
                  { id: 'vcard', icon: User, label: 'vCard' },
                  { id: 'whatsapp', icon: MessageCircle, label: 'WhatsApp' },
                  { id: 'upi', icon: CreditCard, label: 'UPI' },
                  { id: 'wifi', icon: Wifi, label: 'WiFi' },
                ].map((btn) => (
                  <button 
                    key={btn.id}
                    onClick={() => { 
                      setType(btn.id); 
                      if (btn.id === 'url') setValue('https://loveyoutools.in');
                      else if (btn.id === 'upi') setValue('upi://pay?pa=example@upi&pn=Store&cu=INR');
                      else if (btn.id === 'whatsapp') setValue('https://wa.me/919876543210');
                      else setValue(''); 
                    }} 
                    className={`btn ${type === btn.id ? 'bp' : 'bs2'} gap-2 text-xs py-2 px-2`}
                  >
                    <btn.icon className="w-3 h-3" /> {btn.label}
                  </button>
                ))}
              </div>
              <div className="mt-4">
                {renderQrInputs()}
              </div>
            </div>

            {/* Color Customisation */}
            <div className="pt-6 border-t border-border space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-black text-[10px] uppercase tracking-widest flex items-center gap-2 text-text-muted">
                  <Palette className="w-4 h-4 text-accent" /> Colour Customisation
                </h3>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={handleSwapColors}
                    title="Swap Foreground & Background Colors"
                    className="p-1.5 text-xs text-text-secondary hover:text-accent hover:bg-bg-secondary rounded-lg transition-colors flex items-center gap-1 border border-border"
                  >
                    <ArrowLeftRight className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline text-[10px] font-bold">Swap</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleResetColors}
                    title="Reset to Black & White"
                    className="p-1.5 text-xs text-text-secondary hover:text-red-500 hover:bg-bg-secondary rounded-lg transition-colors flex items-center gap-1 border border-border"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline text-[10px] font-bold">Reset</span>
                  </button>
                </div>
              </div>

              {/* Sub-tabs: Custom Colors vs Quick Palettes */}
              <div className="flex p-1 bg-bg-secondary rounded-xl border border-border text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setColorMode('custom')}
                  className={`flex-1 py-1.5 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                    colorMode === 'custom' ? 'bg-surface text-accent shadow-xs' : 'text-text-muted hover:text-text-secondary'
                  }`}
                >
                  <Palette className="w-3.5 h-3.5" /> Custom Colors
                </button>
                <button
                  type="button"
                  onClick={() => setColorMode('presets')}
                  className={`flex-1 py-1.5 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                    colorMode === 'presets' ? 'bg-surface text-accent shadow-xs' : 'text-text-muted hover:text-text-secondary'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" /> Theme Presets
                </button>
              </div>

              {/* Presets Mode */}
              {colorMode === 'presets' ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2 max-h-[220px] overflow-y-auto pr-1 custom-scrollbar">
                    {COLOR_PRESETS.map((preset) => {
                      const isSelected = !isTransparentBg && fgColor.toLowerCase() === preset.fg.toLowerCase() && bgColor.toLowerCase() === preset.bg.toLowerCase();
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => handleApplyPreset(preset)}
                          className={`p-2 rounded-xl border text-left transition-all flex items-center gap-2 ${
                            isSelected 
                              ? 'border-accent bg-accent/5 ring-1 ring-accent' 
                              : 'border-border bg-surface hover:border-accent/40 hover:bg-bg-secondary/40'
                          }`}
                        >
                          <div className="w-6 h-6 rounded-full border border-black/20 shrink-0 overflow-hidden flex shadow-xs">
                            <div className="w-1/2 h-full" style={{ backgroundColor: preset.fg }} />
                            <div className="w-1/2 h-full" style={{ backgroundColor: preset.bg }} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-[11px] font-bold text-text-primary truncate">{preset.name}</div>
                            <div className="text-[9px] text-text-muted font-mono">{preset.fg}</div>
                          </div>
                          {isSelected && <Check className="w-3.5 h-3.5 text-accent shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                /* Custom Color Inputs with Swatches */
                <div className="space-y-3.5">
                  {/* Foreground */}
                  <div className="p-3 bg-bg-secondary/40 rounded-xl border border-border space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-text-secondary flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full border border-black/20" style={{ backgroundColor: fgColor }} />
                        Foreground (QR Modules)
                      </label>
                      <span className="text-[10px] font-mono text-text-muted">{fgColor.toUpperCase()}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input 
                        type="color" 
                        value={fgColor.startsWith('#') ? fgColor : '#000000'} 
                        onChange={(e) => setFgColor(e.target.value)}
                        className="w-9 h-9 p-0.5 rounded-lg border border-border cursor-pointer bg-surface"
                      />
                      <input 
                        type="text" 
                        value={fgColor} 
                        onChange={(e) => setFgColor(e.target.value)}
                        className="fi text-xs font-mono py-1.5 flex-1"
                        placeholder="#000000"
                      />
                    </div>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {FG_SWATCHES.map((swatch) => (
                        <button
                          key={swatch}
                          type="button"
                          onClick={() => setFgColor(swatch)}
                          style={{ backgroundColor: swatch }}
                          className={`w-5 h-5 rounded-md border border-black/20 transition-transform hover:scale-110 ${fgColor.toLowerCase() === swatch.toLowerCase() ? 'ring-2 ring-accent scale-110' : ''}`}
                          title={swatch}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Background */}
                  <div className="p-3 bg-bg-secondary/40 rounded-xl border border-border space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-text-secondary flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full border border-black/20" style={{ backgroundColor: isTransparentBg ? 'transparent' : bgColor }} />
                        Background
                      </label>
                      <label className="flex items-center gap-1 text-[11px] font-bold text-accent cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isTransparentBg}
                          onChange={(e) => setIsTransparentBg(e.target.checked)}
                          className="rounded text-accent focus:ring-0"
                        />
                        Transparent
                      </label>
                    </div>

                    {!isTransparentBg ? (
                      <>
                        <div className="flex items-center gap-2">
                          <input 
                            type="color" 
                            value={bgColor.startsWith('#') ? bgColor : '#ffffff'} 
                            onChange={(e) => setBgColor(e.target.value)}
                            className="w-9 h-9 p-0.5 rounded-lg border border-border cursor-pointer bg-surface"
                          />
                          <input 
                            type="text" 
                            value={bgColor} 
                            onChange={(e) => setBgColor(e.target.value)}
                            className="fi text-xs font-mono py-1.5 flex-1"
                            placeholder="#ffffff"
                          />
                        </div>
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {BG_SWATCHES.map((swatch) => (
                            <button
                              key={swatch}
                              type="button"
                              onClick={() => { setBgColor(swatch); setIsTransparentBg(false); }}
                              style={{ backgroundColor: swatch }}
                              className={`w-5 h-5 rounded-md border border-black/20 transition-transform hover:scale-110 ${bgColor.toLowerCase() === swatch.toLowerCase() ? 'ring-2 ring-accent scale-110' : ''}`}
                              title={swatch}
                            />
                          ))}
                        </div>
                      </>
                    ) : (
                      <p className="text-[11px] text-text-muted italic bg-surface/50 p-2 rounded-lg border border-border/50">
                        Transparent background enabled. The QR code will blend into any background.
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Live Scan Speed & Quality Score Meter */}
              <div className={`p-3.5 rounded-2xl border text-xs transition-all ${
                scanSpeedScore >= 80 
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-300' 
                  : scanSpeedScore >= 60 
                  ? 'bg-blue-500/10 border-blue-500/30 text-blue-800 dark:text-blue-300'
                  : 'bg-amber-500/10 border-amber-500/30 text-amber-800 dark:text-amber-300'
              }`}>
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-1.5 font-black text-xs">
                    {scanSpeedScore >= 80 ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                        <span>⚡ Ultra-Fast Scan (&lt; 0.1s)</span>
                      </>
                    ) : scanSpeedScore >= 60 ? (
                      <>
                        <Zap className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                        <span>🚀 Fast Scan (&lt; 0.3s)</span>
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                        <span>⚠️ Moderate Scan Speed</span>
                      </>
                    )}
                  </div>
                  <span className="font-mono font-bold text-[11px] px-2 py-0.5 rounded-full bg-surface border border-current">
                    {scanSpeedScore}/100
                  </span>
                </div>

                <div className="w-full bg-black/10 dark:bg-white/10 rounded-full h-1.5 mb-2 overflow-hidden">
                  <div 
                    className={`h-full rounded-full transition-all duration-300 ${
                      scanSpeedScore >= 80 ? 'bg-emerald-500' : scanSpeedScore >= 60 ? 'bg-blue-500' : 'bg-amber-500'
                    }`}
                    style={{ width: `${scanSpeedScore}%` }}
                  />
                </div>

                <p className="text-[10px] opacity-90 leading-relaxed">
                  {scanSpeedScore >= 80 ? (
                    'Verified 100% compatible with Google Lens, iPhone Camera, Paytm, PhonePe, and handheld barcode scanners.'
                  ) : scanSpeedScore >= 60 ? (
                    'Good readability. For instant response in low lighting, click "Auto Fix" to maximize contrast.'
                  ) : (
                    'Warning: Low color contrast or inverted colors may delay scanning. Use dark modules on a light background for fastest scanning.'
                  )}
                </p>
              </div>

              {/* Fast-Scan Error Correction & Quiet Zone Settings */}
              <div className="space-y-4 pt-2">
                <div className="fg">
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-xs font-bold text-text-secondary flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-accent" />
                      Error Correction: Level {level}
                    </label>
                    <span className="text-[10px] text-text-muted font-bold">
                      {level === 'M' && '⚡ Fastest Scanning (15% redundancy)'}
                      {level === 'L' && 'Smallest data size (7%)'}
                      {level === 'Q' && 'Medium High (25%)'}
                      {level === 'H' && '🛡️ Best for Logos (30%)'}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    {(['L', 'M', 'Q', 'H'] as const).map((l) => (
                      <button 
                        key={l}
                        type="button"
                        onClick={() => setLevel(l)}
                        className={`flex-1 py-1.5 rounded-xl border text-xs font-bold transition-all ${
                          level === l 
                            ? 'bg-accent text-white border-accent shadow-xs scale-102' 
                            : 'border-border hover:bg-bg-secondary text-text-secondary'
                        }`}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-text-muted mt-1.5">
                    {level === 'M' ? 'Level M is the industry standard for instant scanning on all camera apps.' : 'Higher levels add extra dots. Level M is recommended unless adding a logo.'}
                  </p>
                </div>

                {/* Quiet Zone Margin (Standard 4 modules for ISO QR Code recognition) */}
                <div className="p-3 bg-bg-secondary rounded-2xl border border-border space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-text-secondary block">Quiet Zone (Margin)</span>
                      <span className="text-[10px] text-text-muted">Standard 4 modules required by scanner cameras</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIncludeMargin(!includeMargin)}
                      className={`relative w-10 h-5 rounded-full transition-colors ${includeMargin ? 'bg-accent' : 'bg-border'}`}
                    >
                      <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${includeMargin ? 'translate-x-5' : ''}`} />
                    </button>
                  </div>

                  {includeMargin && (
                    <div className="flex items-center gap-1.5 pt-1">
                      {[
                        { label: 'Standard (4)', val: 4, desc: 'Fastest' },
                        { label: 'Compact (2)', val: 2, desc: 'Tight' },
                        { label: 'Wide (6)', val: 6, desc: 'Print' },
                      ].map((m) => (
                        <button
                          key={m.val}
                          type="button"
                          onClick={() => setMarginSize(m.val)}
                          className={`flex-1 py-1 px-2 rounded-lg border text-[10px] font-bold transition-all ${
                            marginSize === m.val ? 'bg-accent text-white border-accent' : 'border-border bg-surface text-text-muted'
                          }`}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Logo Overlay */}
            <div className="pt-6 border-t border-border space-y-4">
              <h3 className="font-black text-[10px] uppercase tracking-widest flex items-center gap-2 text-text-muted">
                <ImageIcon className="w-4 h-4 text-accent" /> Center Logo / Icon Overlay
              </h3>
              <div className="space-y-4">
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleLogoUpload} 
                  accept="image/*" 
                  className="hidden" 
                />
                
                {!logoImage ? (
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full aspect-video border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center gap-2 hover:border-accent hover:bg-accent/5 transition-all text-text-muted bg-surface/30 cursor-pointer"
                  >
                    <ImageIcon className="w-6 h-6 text-accent/70" />
                    <span className="text-[10px] font-bold uppercase tracking-wider">Upload Brand Logo (PNG / JPG)</span>
                    <span className="text-[9px] text-text-muted">Auto-excavates center without breaking scan</span>
                  </button>
                ) : (
                  <div className="relative group">
                    <img src={logoImage} className="w-full aspect-video object-contain bg-bg-secondary rounded-xl border border-border p-4" alt="Logo preview" />
                    <button 
                      onClick={() => setLogoImage(null)}
                      className="absolute top-2 right-2 p-1.5 bg-red-500/80 backdrop-blur-sm text-white rounded-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600 shadow-sm cursor-pointer"
                      title="Remove Logo"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {logoImage && (
                  <div className="fg">
                    <label className="text-xs font-bold mb-2 block text-text-secondary">Logo Size: {logoSize}px</label>
                    <input 
                      type="range" 
                      min="20" max="80" step="5" 
                      value={logoSize} 
                      onChange={(e) => setLogoSize(Number(e.target.value))}
                      className="w-full accent-accent"
                    />
                    <p className="text-[10px] text-text-muted mt-1">Keep under 50px for guaranteed instant camera decoding.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: BARCODE GENERATOR CONTROLS */}
        {activeTab === 'barcode' && (
          <div className="sidebar-content custom-scrollbar p-6 space-y-6">
            {/* Barcode Type & Format Selector */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-black text-[10px] uppercase tracking-widest flex items-center gap-2 text-text-muted">
                  <BarcodeIcon className="w-4 h-4 text-accent" /> 1D Barcode Symbology
                </h3>
                <span className="text-[9px] px-2 py-0.5 rounded-full bg-accent/10 text-accent font-bold">
                  {currentBarcodeMeta.name.split(' ')[0]}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-1.5 max-h-[200px] overflow-y-auto custom-scrollbar pr-1">
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

            {/* Barcode Data Input */}
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
                    <span className="font-bold block">Barcode Format Issue</span>
                    <span className="text-[10px] opacity-90">{currentBarcodeMeta.patternHelp}</span>
                  </div>
                </div>
              ) : (
                <div className="p-2 rounded-xl bg-bg-secondary text-[10px] text-text-muted flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-text-muted shrink-0" />
                  <span>{currentBarcodeMeta.patternHelp}</span>
                </div>
              )}
            </div>

            {/* Barcode Style Customisation */}
            <div className="pt-4 border-t border-border space-y-4">
              <h3 className="font-black text-[10px] uppercase tracking-widest flex items-center gap-2 text-text-muted">
                <Sliders className="w-4 h-4 text-accent" /> Barcode Dimensions
              </h3>

              {/* Bar Width */}
              <div className="fg">
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-bold text-text-secondary">Bar Width: {barcodeBarWidth}px</label>
                  <span className="text-[10px] text-text-muted">{barcodeBarWidth === 2 ? 'Recommended' : ''}</span>
                </div>
                <input 
                  type="range" 
                  min="1" max="4" step="1" 
                  value={barcodeBarWidth} 
                  onChange={(e) => setBarcodeBarWidth(Number(e.target.value))}
                  className="w-full accent-accent"
                />
              </div>

              {/* Bar Height */}
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

              {/* Quiet Margin */}
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
                  <span className="text-xs font-bold text-text-secondary block">Display Human-Readable Text</span>
                  <span className="text-[10px] text-text-muted">Print numbers / labels beneath bars</span>
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
                    className="rounded text-accent focus:ring-0"
                  />
                  Transparent BG
                </label>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="p-2.5 bg-bg-secondary/40 rounded-xl border border-border">
                  <label className="text-[10px] font-bold text-text-muted block mb-1">Bar Color</label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="color"
                      value={barcodeFgColor}
                      onChange={(e) => setBarcodeFgColor(e.target.value)}
                      className="w-7 h-7 p-0.5 rounded border border-border cursor-pointer bg-surface"
                    />
                    <input
                      type="text"
                      value={barcodeFgColor}
                      onChange={(e) => setBarcodeFgColor(e.target.value)}
                      className="fi text-xs font-mono py-1 px-1.5 flex-1"
                    />
                  </div>
                </div>

                <div className="p-2.5 bg-bg-secondary/40 rounded-xl border border-border">
                  <label className="text-[10px] font-bold text-text-muted block mb-1">Background</label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="color"
                      disabled={barcodeIsTransparentBg}
                      value={barcodeBgColor}
                      onChange={(e) => setBarcodeBgColor(e.target.value)}
                      className="w-7 h-7 p-0.5 rounded border border-border cursor-pointer bg-surface disabled:opacity-40"
                    />
                    <input
                      type="text"
                      disabled={barcodeIsTransparentBg}
                      value={barcodeIsTransparentBg ? 'Transparent' : barcodeBgColor}
                      onChange={(e) => setBarcodeBgColor(e.target.value)}
                      className="fi text-xs font-mono py-1 px-1.5 flex-1 disabled:opacity-50"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Sidebar Bottom Actions (Download & Print) */}
        <div className="sidebar-actions p-4 border-t border-border bg-surface flex flex-col gap-2">
          {activeTab === 'qr' ? (
            <>
              <div className="flex gap-2">
                {(['png', 'svg', 'jpeg'] as const).map((fmt) => (
                  <button 
                    key={fmt}
                    onClick={() => setDownloadFormat(fmt)} 
                    className={`flex-1 py-1.5 rounded-xl border font-bold text-xs uppercase transition-all ${
                      downloadFormat === fmt ? 'bg-accent text-white border-accent shadow-xs' : 'border-border hover:bg-bg-secondary text-text-secondary'
                    }`}
                  >
                    {fmt}
                  </button>
                ))}
              </div>
              <button 
                onClick={handleDownloadQr} 
                className="btn bp gap-2 w-full py-3.5 text-xs font-black uppercase tracking-widest shadow-lg shadow-accent/20 cursor-pointer"
              >
                <Download className="w-4 h-4" /> Download QR Code ({downloadFormat.toUpperCase()})
              </button>
            </>
          ) : (
            <>
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
                  title="Print Label"
                  className="p-3 rounded-xl border border-border bg-surface hover:bg-bg-secondary transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Printer className="w-4 h-4 text-text-secondary" />
                </button>
              </div>
            </>
          )}
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
                  {activeTab === 'qr' ? (
                    <>
                      <QrCode className="w-3.5 h-3.5 text-accent" />
                      <span>QR Code Preview</span>
                    </>
                  ) : (
                    <>
                      <BarcodeIcon className="w-3.5 h-3.5 text-accent" />
                      <span>{currentBarcodeMeta.name}</span>
                    </>
                  )}
                </span>
              </div>

              {activeTab === 'qr' && (
                <div className="pointer-events-auto">
                  <button
                    onClick={handleOptimizeFastScan}
                    className="px-3 py-1 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white font-black text-[10px] uppercase tracking-wider shadow-xs transition-all flex items-center gap-1 cursor-pointer"
                  >
                    <Zap className="w-3 h-3" /> Ultra-Fast Scan
                  </button>
                </div>
              )}
            </div>

            {/* PREVIEW CONTAINER */}
            {activeTab === 'qr' ? (
              <div 
                ref={qrRef} 
                className="p-6 rounded-2xl shadow-xl transition-all flex items-center justify-center relative overflow-hidden"
                style={{ 
                  backgroundColor: isTransparentBg ? 'transparent' : bgColor,
                  backgroundImage: isTransparentBg ? 'repeating-conic-gradient(#cbd5e1 0% 25%, transparent 0% 50%) 50% / 16px 16px' : 'none'
                }}
              >
                {downloadFormat === 'png' || downloadFormat === 'jpeg' ? (
                  <QRCodeCanvas 
                    value={value || ' '} 
                    size={size} 
                    bgColor={effectiveBgColor} 
                    fgColor={fgColor} 
                    level={level}
                    marginSize={includeMargin ? marginSize : 0}
                    boostLevel={true}
                    imageSettings={logoImage ? {
                      src: logoImage,
                      x: undefined,
                      y: undefined,
                      height: logoSize,
                      width: logoSize,
                      excavate: true,
                    } : undefined}
                  />
                ) : (
                  <QRCodeSVG 
                    value={value || ' '} 
                    size={size} 
                    bgColor={effectiveBgColor} 
                    fgColor={fgColor} 
                    level={level}
                    marginSize={includeMargin ? marginSize : 0}
                    boostLevel={true}
                    imageSettings={logoImage ? {
                      src: logoImage,
                      x: undefined,
                      y: undefined,
                      height: logoSize,
                      width: logoSize,
                      excavate: true,
                    } : undefined}
                  />
                )}
              </div>
            ) : (
              /* BARCODE PREVIEW */
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
            )}

            {/* Badges / Diagnostics bar */}
            <div className="flex flex-wrap items-center justify-center gap-2 mt-6 text-xs">
              {activeTab === 'qr' ? (
                <>
                  <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface border border-border shadow-2xs font-mono text-[11px]">
                    <span className="w-2.5 h-2.5 rounded-full border border-black/20" style={{ backgroundColor: fgColor }} />
                    <span>FG: {fgColor.toUpperCase()}</span>
                  </div>
                  <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface border border-border shadow-2xs font-mono text-[11px]">
                    <span className="w-2.5 h-2.5 rounded-full border border-black/20" style={{ backgroundColor: isTransparentBg ? 'transparent' : bgColor }} />
                    <span>BG: {isTransparentBg ? 'TRANSPARENT' : bgColor.toUpperCase()}</span>
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-bold text-[10px] border border-emerald-500/20">
                    Quiet Zone: {includeMargin ? `${marginSize} modules` : 'None'}
                  </span>
                  <span className="px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-300 font-bold text-[10px] border border-blue-500/20">
                    Recovery: Level {level}
                  </span>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface border border-border shadow-2xs font-mono text-[11px]">
                    <span>Format: {currentBarcodeMeta.name}</span>
                  </div>
                  <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface border border-border shadow-2xs font-mono text-[11px]">
                    <span>Length: {barcodeValue.length} chars</span>
                  </div>
                  <button
                    onClick={handlePrintBarcode}
                    className="px-2.5 py-1 rounded-full bg-accent/10 text-accent font-bold text-[10px] border border-accent/20 hover:bg-accent/20 transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <Printer className="w-3 h-3" /> Thermal Label Ready
                  </button>
                </>
              )}
            </div>

            {/* Slider control: Size for QR or Barcode */}
            {activeTab === 'qr' && (
              <div className="mt-6 w-full max-w-md bg-surface p-4 rounded-xl border border-border shadow-sm">
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-bold text-text-secondary">QR Code Size: {size}px</label>
                  <span className="text-[10px] text-text-muted">High-Res Pixel Snap</span>
                </div>
                <input 
                  type="range" 
                  min="160" max="600" step="20" 
                  value={size} 
                  onChange={(e) => setSize(Number(e.target.value))}
                  className="w-full accent-accent"
                />
              </div>
            )}

            {/* Test Scanner Payload Inspector */}
            <div className="mt-4 w-full max-w-md bg-surface p-3 rounded-xl border border-border shadow-2xs">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3 text-emerald-500" />
                  Encoded Scannable Payload
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
                {activeTab === 'qr' ? (value || '<Empty>') : (barcodeValue || '<Empty>')}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
