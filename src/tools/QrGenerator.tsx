import { useState, useRef, ChangeEvent } from 'react';
import { QRCodeCanvas, QRCodeSVG } from 'qrcode.react';
import { Download, Link as LinkIcon, Type, Phone, Mail, Wifi, MessageSquare, User, MessageCircle, Image as ImageIcon, Settings, Palette, Trash2, CreditCard } from 'lucide-react';

export default function QrGenerator() {
  const [type, setType] = useState('url');
  const [value, setValue] = useState('https://loveyoutools.in');
  const [size, setSize] = useState(256);
  const [fgColor, setFgColor] = useState('#000000');
  const [bgColor, setBgColor] = useState('#ffffff');
  const [level, setLevel] = useState<'L' | 'M' | 'Q' | 'H'>('H');
  const [includeMargin, setIncludeMargin] = useState(true);
  const [logoImage, setLogoImage] = useState<string | null>(null);
  const [logoSize, setLogoSize] = useState(40);
  const [downloadFormat, setDownloadFormat] = useState<'png' | 'svg'>('png');
  
  const qrRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      URL.revokeObjectURL(svgUrl);
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
          <div className="fg">
            <label className="fl">Website URL</label>
            <input type="url" className="fi" value={value} onChange={(e) => setValue(e.target.value)} placeholder="loveyoutools.in" />
          </div>
        );
      case 'text':
        return (
          <div className="fg">
            <label className="fl">Text Content</label>
            <textarea className="fta min-h-[100px]" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Enter your text here..." />
          </div>
        );
      case 'phone':
        return (
          <div className="fg">
            <label className="fl">Phone Number</label>
            <input type="tel" className="fi" value={value.replace('tel:', '')} onChange={(e) => setValue(`tel:${e.target.value}`)} placeholder="+1234567890" />
          </div>
        );
      case 'email':
        return (
          <div className="fg">
            <label className="fl">Email Address</label>
            <input type="email" className="fi" value={value.replace('mailto:', '')} onChange={(e) => setValue(`mailto:${e.target.value}`)} placeholder="hello@example.com" />
          </div>
        );
      case 'sms':
        return (
          <div className="fg">
            <label className="fl">Phone Number</label>
            <input type="tel" className="fi mb-2" value={value.match(/smsto:(.*?):/)?.[1] || ''} onChange={(e) => {
              const msg = value.split(':').slice(2).join(':') || '';
              setValue(`smsto:${e.target.value}:${msg}`);
            }} placeholder="+1234567890" />
            <label className="fl">Message</label>
            <textarea className="fta" value={value.split(':').slice(2).join(':') || ''} onChange={(e) => {
              const phone = value.match(/smsto:(.*?):/)?.[1] || '';
              setValue(`smsto:${phone}:${e.target.value}`);
            }} placeholder="Type your message..." />
          </div>
        );
      case 'vcard':
        return (
          <div className="fg">
            <label className="fl">Full Name</label>
            <input type="text" className="fi mb-2" placeholder="John Doe" onChange={(e) => {
              setValue(`BEGIN:VCARD\nVERSION:3.0\nFN:${e.target.value}\nEND:VCARD`);
            }} />
            <p className="text-xs text-text-muted">Advanced vCard support coming soon. Currently supports basic name.</p>
          </div>
        );
      case 'whatsapp':
        return (
          <div className="fg">
            <label className="fl">WhatsApp Number</label>
            <input type="tel" className="fi mb-2" placeholder="Input your mobile no." onChange={(e) => {
              setValue(`https://wa.me/${e.target.value}`);
            }} />
          </div>
        );
      case 'upi':
        return (
          <div className="fg">
            <label className="fl">UPI ID (VPA)</label>
            <input 
              type="text" 
              className="fi mb-2" 
              placeholder="example@upi" 
              onChange={(e) => {
                const name = value.match(/pn=(.*?)(&|$)/)?.[1] || '';
                const am = value.match(/am=(.*?)(&|$)/)?.[1] || '';
                setValue(`upi://pay?pa=${e.target.value}&pn=${name}&am=${am}&cu=INR`);
              }} 
            />
            <label className="fl">Payee Name</label>
            <input 
              type="text" 
              className="fi mb-2" 
              placeholder="John Doe" 
              onChange={(e) => {
                const pa = value.match(/pa=(.*?)(&|$)/)?.[1] || '';
                const am = value.match(/am=(.*?)(&|$)/)?.[1] || '';
                setValue(`upi://pay?pa=${pa}&pn=${e.target.value}&am=${am}&cu=INR`);
              }} 
            />
            <label className="fl">Amount (Optional)</label>
            <input 
              type="number" 
              className="fi" 
              placeholder="0.00" 
              onChange={(e) => {
                const pa = value.match(/pa=(.*?)(&|$)/)?.[1] || '';
                const name = value.match(/pn=(.*?)(&|$)/)?.[1] || '';
                setValue(`upi://pay?pa=${pa}&pn=${name}&am=${e.target.value}&cu=INR`);
              }} 
            />
          </div>
        );
      case 'wifi':
        return (
          <div className="fg">
            <label className="fl">WiFi Network (SSID)</label>
            <input 
              type="text" 
              className="fi mb-2" 
              value={value.match(/S:(.*?);/)?.[1] || ''} 
              placeholder="Network Name" 
              onChange={(e) => {
                const pass = value.match(/P:(.*?);/)?.[1] || '';
                setValue(`WIFI:S:${e.target.value};T:WPA;P:${pass};;`);
              }} 
            />
            <label className="fl">Password</label>
            <input 
              type="password" 
              className="fi" 
              value={value.match(/P:(.*?);/)?.[1] || ''} 
              placeholder="Password" 
              onChange={(e) => {
                const ssid = value.match(/S:(.*?);/)?.[1] || '';
                setValue(`WIFI:S:${ssid};T:WPA;P:${e.target.value};;`);
              }} 
            />
          </div>
        );
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
            <h3 className="font-black text-[10px] uppercase tracking-widest flex items-center gap-2 text-text-muted">
              <Palette className="w-4 h-4 text-accent" /> Customization
            </h3>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="fg">
                  <label className="text-xs font-bold mb-2 block text-text-secondary">Foreground</label>
                  <div className="flex gap-2">
                    <input type="color" value={fgColor} onChange={(e) => setFgColor(e.target.value)} className="w-10 h-10 rounded cursor-pointer border-0 p-0" />
                    <input type="text" value={fgColor} onChange={(e) => setFgColor(e.target.value)} className="fi flex-1 font-mono uppercase text-xs py-2" />
                  </div>
                </div>
                <div className="fg">
                  <label className="text-xs font-bold mb-2 block text-text-secondary">Background</label>
                  <div className="flex gap-2">
                    <input type="color" value={bgColor} onChange={(e) => setBgColor(e.target.value)} className="w-10 h-10 rounded cursor-pointer border-0 p-0" />
                    <input type="text" value={bgColor} onChange={(e) => setBgColor(e.target.value)} className="fi flex-1 font-mono uppercase text-xs py-2" />
                  </div>
                </div>
              </div>

              <div className="fg">
                <label className="text-xs font-bold mb-2 block text-text-secondary">Error Correction: {level}</label>
                <div className="flex gap-2">
                  {['L', 'M', 'Q', 'H'].map((l) => (
                    <button 
                      key={l}
                      onClick={() => setLevel(l as any)}
                      className={`flex-1 py-1.5 rounded-lg border text-xs font-bold transition-colors ${level === l ? 'bg-accent text-white border-accent' : 'border-border hover:bg-bg-secondary'}`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between p-3 bg-bg-secondary rounded-xl border border-border">
                <span className="text-xs font-bold text-text-secondary">Include Margin</span>
                <button
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
              className="p-6 rounded-2xl shadow-xl transition-all bg-white flex items-center justify-center"
              style={{ backgroundColor: bgColor }}
            >
              {downloadFormat === 'png' ? (
                <QRCodeCanvas 
                  value={value || ' '} 
                  size={size} 
                  bgColor={bgColor} 
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
                  bgColor={bgColor} 
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

