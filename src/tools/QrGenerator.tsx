import { useState, useRef, useMemo, ChangeEvent } from 'react';
import { QRCodeCanvas, QRCodeSVG } from 'qrcode.react';
import { 
  Download, Link as LinkIcon, Type, Phone, Mail, Wifi, MessageSquare, 
  User, MessageCircle, Image as ImageIcon, Settings, Palette, Trash2, 
  CreditCard, ArrowLeftRight, RotateCcw, Check, AlertTriangle, CheckCircle2,
  Sparkles, Layers
} from 'lucide-react';

interface ColorPreset {
  id: string;
  name: string;
  fg: string;
  bg: string;
}

const COLOR_PRESETS: ColorPreset[] = [
  { id: 'classic', name: 'Classic B&W', fg: '#000000', bg: '#ffffff' },
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

export default function QrGenerator() {
  const [type, setType] = useState('url');
  const [value, setValue] = useState('https://loveyoutools.in');
  const [size, setSize] = useState(256);
  const [fgColor, setFgColor] = useState('#000000');
  const [bgColor, setBgColor] = useState('#ffffff');
  const [isTransparentBg, setIsTransparentBg] = useState(false);
  const [colorMode, setColorMode] = useState<'presets' | 'custom'>('custom');
  const [level, setLevel] = useState<'L' | 'M' | 'Q' | 'H'>('H');
  const [includeMargin, setIncludeMargin] = useState(true);
  const [logoImage, setLogoImage] = useState<string | null>(null);
  const [logoSize, setLogoSize] = useState(40);
  const [downloadFormat, setDownloadFormat] = useState<'png' | 'svg'>('png');
  const [upiType, setUpiType] = useState<'vpa' | 'account'>('vpa');
  
  const qrRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    if (isTransparentBg) return 21; // transparent assumed high contrast
    const l1 = getLuminance(fgColor);
    const l2 = getLuminance(bgColor);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
  }, [fgColor, bgColor, isTransparentBg]);

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

  const handleDownload = () => {
    if (!qrRef.current) return;
    
    if (downloadFormat === 'png') {
      const canvas = qrRef.current.querySelector('canvas');
      if (!canvas) return;
      const url = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = `qrcode-${Date.now()}.png`;
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
      a.download = `qrcode-${Date.now()}.svg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(svgUrl), 1000);
    }
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

  const renderInput = () => {
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
              placeholder="loveyoutools.in" 
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
              placeholder="Enter your text here..." 
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
            <p className="text-xs text-text-muted">Advanced vCard support coming soon. Currently supports basic name.</p>
          </div>
        );
      }
      case 'whatsapp': {
        const waNumber = value.startsWith('https://wa.me/') ? value.replace('https://wa.me/', '') : value;
        return (
          <div className="fg" key="type-whatsapp">
            <label className="fl">WhatsApp Number</label>
            <input 
              key="input-whatsapp-num"
              type="tel" 
              className="fi mb-2" 
              value={waNumber}
              placeholder="Input your mobile no." 
              onChange={(e) => {
                setValue(`https://wa.me/${e.target.value}`);
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
                <label className="fl">UPI ID (VPA)</label>
                <input 
                  key="input-upi-vpa"
                  type="text" 
                  className="fi mb-2" 
                  value={vpaVal}
                  placeholder="example@upi" 
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
                  placeholder="ABCD0123456" 
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
            
            <label className="fl">Payee Name</label>
            <input 
              key="input-upi-payee"
              type="text" 
              className="fi mb-2" 
              value={payeeName}
              placeholder="John Doe" 
              onChange={(e) => {
                const pa = value.match(/pa=([^&]+)/)?.[1] || '';
                const am = value.match(/am=([^&]+)/)?.[1] || '';
                setValue(`upi://pay?pa=${pa}&pn=${encodeURIComponent(e.target.value)}&am=${am}&cu=INR`);
              }} 
            />
            <label className="fl">Amount (Optional)</label>
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
              placeholder="Network Name" 
              onChange={(e) => {
                setValue(`WIFI:S:${e.target.value};T:WPA;P:${wifiPass};;`);
              }} 
            />
            <label className="fl">Password</label>
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

  return (
    <div className="tool-layout-container">
      {/* Left Controls (Sidebar) */}
      <aside className="tool-sidebar">
        <div className="sidebar-content custom-scrollbar p-6 space-y-6">
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
                  onClick={() => { setType(btn.id); setValue(''); }} 
                  className={`btn ${type === btn.id ? 'bp' : 'bs2'} gap-2 text-xs py-2 px-2`}
                >
                  <btn.icon className="w-3 h-3" /> {btn.label}
                </button>
              ))}
            </div>
            <div className="mt-4">
              {renderInput()}
            </div>
          </div>

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
                  <div className="flex gap-2">
                    <div className="relative w-10 h-10 rounded-xl overflow-hidden border border-border shadow-xs shrink-0 cursor-pointer">
                      <input 
                        key="input-fg-color-picker"
                        type="color" 
                        value={fgColor || '#000000'} 
                        onChange={(e) => setFgColor(e.target.value)} 
                        className="absolute -top-3 -left-3 w-16 h-16 cursor-pointer border-0 p-0" 
                      />
                    </div>
                    <input 
                      key="input-fg-color-text"
                      type="text" 
                      value={fgColor || ''} 
                      onChange={(e) => setFgColor(e.target.value)} 
                      placeholder="#000000"
                      className="fi flex-1 font-mono uppercase text-xs py-2" 
                    />
                  </div>

                  {/* Foreground Quick Swatches */}
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {FG_SWATCHES.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setFgColor(color)}
                        className={`w-5 h-5 rounded-md border transition-transform hover:scale-110 shadow-2xs ${
                          fgColor.toLowerCase() === color.toLowerCase() ? 'ring-2 ring-accent ring-offset-1 scale-105 border-accent' : 'border-black/15'
                        }`}
                        style={{ backgroundColor: color }}
                        title={color}
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
                    <span className="text-[10px] font-mono text-text-muted">
                      {isTransparentBg ? 'TRANSPARENT' : (bgColor || '#FFFFFF').toUpperCase()}
                    </span>
                  </div>

                  <div className="flex gap-2">
                    <div className={`relative w-10 h-10 rounded-xl overflow-hidden border border-border shadow-xs shrink-0 cursor-pointer ${isTransparentBg ? 'opacity-40 pointer-events-none' : ''}`}>
                      <input 
                        key="input-bg-color-picker"
                        type="color" 
                        value={isTransparentBg ? '#ffffff' : (bgColor || '#ffffff')} 
                        onChange={(e) => { setBgColor(e.target.value); setIsTransparentBg(false); }} 
                        className="absolute -top-3 -left-3 w-16 h-16 cursor-pointer border-0 p-0" 
                      />
                    </div>
                    <input 
                      key="input-bg-color-text"
                      type="text" 
                      value={isTransparentBg ? 'Transparent' : (bgColor || '')} 
                      disabled={isTransparentBg}
                      onChange={(e) => setBgColor(e.target.value)} 
                      placeholder="#FFFFFF"
                      className={`fi flex-1 font-mono uppercase text-xs py-2 ${isTransparentBg ? 'bg-bg-secondary/50 text-text-muted italic' : ''}`} 
                    />
                    <button
                      type="button"
                      onClick={() => setIsTransparentBg(!isTransparentBg)}
                      className={`px-3 py-1.5 rounded-xl border text-[11px] font-bold transition-all flex items-center gap-1.5 shrink-0 ${
                        isTransparentBg 
                          ? 'bg-accent text-white border-accent shadow-xs' 
                          : 'bg-surface text-text-secondary border-border hover:border-accent hover:text-accent'
                      }`}
                      title="Make background transparent (PNG / SVG)"
                    >
                      <Layers className="w-3.5 h-3.5" />
                      Transparent
                    </button>
                  </div>

                  {/* Background Quick Swatches */}
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {BG_SWATCHES.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => { setBgColor(color); setIsTransparentBg(false); }}
                        className={`w-5 h-5 rounded-md border transition-transform hover:scale-110 shadow-2xs ${
                          !isTransparentBg && bgColor.toLowerCase() === color.toLowerCase() ? 'ring-2 ring-accent ring-offset-1 scale-105 border-accent' : 'border-black/15'
                        }`}
                        style={{ backgroundColor: color }}
                        title={color}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Scan Quality & Contrast Safety Alert */}
            <div className={`p-3 rounded-xl border text-xs transition-all ${
              contrastRatio >= 4.5 
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-300' 
                : contrastRatio >= 2.5 
                ? 'bg-amber-500/10 border-amber-500/20 text-amber-700 dark:text-amber-300'
                : 'bg-rose-500/10 border-rose-500/20 text-rose-700 dark:text-rose-300'
            }`}>
              <div className="flex items-start gap-2">
                {contrastRatio >= 4.5 ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className={`w-4 h-4 shrink-0 mt-0.5 ${contrastRatio >= 2.5 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400'}`} />
                )}
                <div>
                  <div className="font-bold flex items-center gap-1.5">
                    {isTransparentBg ? (
                      <>Optimal Contrast (Transparent Canvas)</>
                    ) : contrastRatio >= 4.5 ? (
                      <>High Contrast ({contrastRatio.toFixed(1)}:1) • Quick Scan</>
                    ) : contrastRatio >= 2.5 ? (
                      <>Moderate Contrast ({contrastRatio.toFixed(1)}:1)</>
                    ) : (
                      <>Low Contrast ({contrastRatio.toFixed(1)}:1) • Risk of Scan Failure</>
                    )}
                  </div>
                  <p className="text-[10px] opacity-85 mt-0.5">
                    {isTransparentBg
                      ? 'Transparent background exports clean PNG/SVG suitable for posters, flyers, and templates.'
                      : contrastRatio >= 4.5 
                      ? 'High color contrast ensures all phone cameras, scanner apps, and barcodes scan instantly.'
                      : contrastRatio >= 2.5
                      ? 'Readable by most cameras. For maximum reliability in dim lighting, increase contrast.'
                      : 'Warning: Foreground and background colors are too similar. Please select a darker foreground or lighter background.'}
                  </p>
                </div>
              </div>
            </div>

            {/* Error correction & Margin */}
            <div className="space-y-4 pt-2">
              <div className="fg">
                <div className="flex justify-between items-center mb-2">
                  <label className="text-xs font-bold text-text-secondary">Error Correction: {level}</label>
                  <span className="text-[10px] text-text-muted">
                    {level === 'L' && '7% damage recovery'}
                    {level === 'M' && '15% recovery'}
                    {level === 'Q' && '25% recovery'}
                    {level === 'H' && '30% recovery (Recommended for custom colors)'}
                  </span>
                </div>
                <div className="flex gap-2">
                  {(['L', 'M', 'Q', 'H'] as const).map((l) => (
                    <button 
                      key={l}
                      type="button"
                      onClick={() => setLevel(l)}
                      className={`flex-1 py-1.5 rounded-lg border text-xs font-bold transition-colors ${level === l ? 'bg-accent text-white border-accent shadow-xs' : 'border-border hover:bg-bg-secondary'}`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between p-3 bg-bg-secondary rounded-xl border border-border">
                <div>
                  <span className="text-xs font-bold text-text-secondary block">Include Quiet Zone Margin</span>
                  <span className="text-[10px] text-text-muted">Adds outer spacing so scanners detect boundaries</span>
                </div>
                <button
                  type="button"
                  onClick={() => setIncludeMargin(!includeMargin)}
                  className={`relative w-10 h-5 rounded-full transition-colors ${includeMargin ? 'bg-accent' : 'bg-border'}`}
                >
                  <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${includeMargin ? 'translate-x-5' : ''}`} />
                </button>
              </div>
            </div>
          </div>

          <div className="pt-6 border-t border-border space-y-4">
            <h3 className="font-black text-[10px] uppercase tracking-widest flex items-center gap-2 text-text-muted">
              <ImageIcon className="w-4 h-4 text-accent" /> Logo Overlay
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
                  className="w-full aspect-video border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center gap-2 hover:border-accent hover:bg-accent/5 transition-all text-text-muted bg-surface/30"
                >
                  <ImageIcon className="w-6 h-6" />
                  <span className="text-[10px] font-bold uppercase tracking-wider">Upload Logo (PNG/JPG)</span>
                </button>
              ) : (
                <div className="relative group">
                  <img src={logoImage} className="w-full aspect-video object-contain bg-bg-secondary rounded-xl border border-border p-4" alt="Logo preview" />
                  <button 
                    onClick={() => setLogoImage(null)}
                    className="absolute top-2 right-2 p-1.5 bg-red-500/80 backdrop-blur-sm text-white rounded-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600 shadow-sm"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              )}

              {logoImage && (
                <div className="fg">
                  <label className="text-xs font-bold mb-2 block text-text-secondary">Logo Size: {logoSize}px</label>
                  <input 
                    type="range" 
                    min="20" max="100" step="5" 
                    value={logoSize} 
                    onChange={(e) => setLogoSize(Number(e.target.value))}
                    className="w-full accent-accent"
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="sidebar-actions p-4 border-t border-border bg-surface flex flex-col gap-2">
          <div className="flex gap-2">
            <button 
              onClick={() => setDownloadFormat('png')} 
              className={`flex-1 py-2 rounded-xl border font-bold text-xs transition-all ${downloadFormat === 'png' ? 'bg-accent text-white border-accent' : 'border-border hover:bg-bg-secondary'}`}
            >
              PNG
            </button>
            <button 
              onClick={() => setDownloadFormat('svg')} 
              className={`flex-1 py-2 rounded-xl border font-bold text-xs transition-all ${downloadFormat === 'svg' ? 'bg-accent text-white border-accent' : 'border-border hover:bg-bg-secondary'}`}
            >
              SVG
            </button>
          </div>
          <button onClick={handleDownload} className="btn bp gap-2 w-full py-4 text-xs font-black uppercase tracking-widest shadow-lg shadow-accent/20">
            <Download className="w-4 h-4" /> Download {downloadFormat.toUpperCase()}
          </button>
        </div>
      </aside>

      {/* Right Preview */}
      <main className="tool-main-preview">
        <div className="preview-content-wrapper p-4 lg:p-8 flex flex-col gap-4">
          <div className="flex-1 flex flex-col items-center justify-center p-4 overflow-hidden relative touch-none bg-bg-secondary/30 rounded-xl border border-border shadow-inner">
            <div 
              ref={qrRef} 
              className="p-6 rounded-2xl shadow-xl transition-all flex items-center justify-center relative overflow-hidden"
              style={{ 
                backgroundColor: isTransparentBg ? 'transparent' : bgColor,
                backgroundImage: isTransparentBg ? 'repeating-conic-gradient(#cbd5e1 0% 25%, transparent 0% 50%) 50% / 16px 16px' : 'none'
              }}
            >
              {downloadFormat === 'png' ? (
                <QRCodeCanvas 
                  value={value || ' '} 
                  size={size} 
                  bgColor={effectiveBgColor} 
                  fgColor={fgColor} 
                  level={level}
                  includeMargin={includeMargin}
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
                  includeMargin={includeMargin}
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

            {/* Color & Format Status Badge below preview */}
            <div className="flex flex-wrap items-center justify-center gap-2 mt-4 text-xs">
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface border border-border shadow-2xs font-mono text-[11px]">
                <span className="w-2.5 h-2.5 rounded-full border border-black/20" style={{ backgroundColor: fgColor }} />
                <span>FG: {fgColor.toUpperCase()}</span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface border border-border shadow-2xs font-mono text-[11px]">
                <span className="w-2.5 h-2.5 rounded-full border border-black/20" style={{ backgroundColor: isTransparentBg ? 'transparent' : bgColor }} />
                <span>BG: {isTransparentBg ? 'TRANSPARENT' : bgColor.toUpperCase()}</span>
              </div>
              {isTransparentBg && (
                <span className="px-2.5 py-1 rounded-full bg-accent/10 text-accent font-bold text-[10px] border border-accent/20">
                  Transparent Canvas
                </span>
              )}
            </div>
            
            <div className="mt-8 w-full max-w-md bg-surface p-4 rounded-xl border border-border shadow-sm">
              <label className="text-xs font-bold mb-2 block text-text-secondary text-center">Output Size: {size}px</label>
              <input 
                type="range" 
                min="128" max="1024" step="64" 
                value={size} 
                onChange={(e) => setSize(Number(e.target.value))}
                className="w-full accent-accent"
              />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

