import { useState, useRef, useMemo, useEffect, useCallback, ChangeEvent } from 'react';
import QRCodeStyling, {
  DotType,
  CornerSquareType,
  CornerDotType,
  ShapeType,
  GradientType
} from 'qr-code-styling';
import PrintSheetModal from './PrintSheetModal';
import { 
  Download, Link as LinkIcon, Type, Phone, Mail, Wifi, MessageSquare, 
  User, MessageCircle, Image as ImageIcon, Settings, Palette, Trash2, 
  CreditCard, ArrowLeftRight, RotateCcw, Check, CheckCircle2,
  Sparkles, QrCode, Printer, Zap, Copy, CheckCheck,
  ShieldCheck, LayoutTemplate, Shapes, Sliders, Smartphone,
  Tag, Award, Ticket, Store, Lock, Unlock, Key, Eye, EyeOff,
  AlertCircle, ExternalLink, HelpCircle, RefreshCw
} from 'lucide-react';

// --- AES-256-GCM Web Crypto Encryption & Decryption Helpers ---
async function encryptPayload(plainText: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  
  const key = await window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );
  
  const cipherBuffer = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(plainText)
  );
  
  const combined = new Uint8Array(salt.length + iv.length + cipherBuffer.byteLength);
  combined.set(salt, 0);
  combined.set(iv, salt.length);
  combined.set(new Uint8Array(cipherBuffer), salt.length + iv.length);
  
  let binary = '';
  for (let i = 0; i < combined.byteLength; i++) {
    binary += String.fromCharCode(combined[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function decryptPayload(cipherB64Url: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  
  let base64 = cipherB64Url.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) base64 += '=';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  
  if (bytes.length < 28) {
    throw new Error('Invalid encrypted data format');
  }
  
  const salt = bytes.slice(0, 16);
  const iv = bytes.slice(16, 28);
  const ciphertext = bytes.slice(28);
  
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  
  const key = await window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
  
  const decrypted = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );
  
  return dec.decode(decrypted);
}

// --- Preset Color Palettes ---
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

// --- Preset Brand / Utility Logos (Clean Vector SVG Data URIs) ---
interface PresetLogo {
  id: string;
  name: string;
  dataUrl: string;
}

const PRESET_LOGOS: PresetLogo[] = [
  {
    id: 'upi',
    name: 'UPI / Pay',
    dataUrl: `data:image/svg+xml;utf8,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
        <circle cx="50" cy="50" r="48" fill="#008444"/>
        <path d="M35 32 L68 50 L35 68 Z" fill="#ffffff"/>
        <path d="M52 25 L75 50 L52 75" stroke="#F6821F" stroke-width="7" stroke-linecap="round" fill="none"/>
      </svg>`
    )}`
  },
  {
    id: 'whatsapp',
    name: 'WhatsApp',
    dataUrl: `data:image/svg+xml;utf8,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
        <circle cx="50" cy="50" r="48" fill="#25D366"/>
        <path d="M68 59 c-1-0.5-6-3-7-3.5s-1.7-0.7-2.4 0.7c-0.7 1.4-2.7 3.5-3.3 4.2-0.6 0.7-1.2 0.8-2.2 0.3-1-0.5-4.2-1.5-8-4.9-3-2.6-5-5.9-5.6-6.9-0.6-1-0.1-1.6 0.4-2.1 0.5-0.5 1-1.2 1.5-1.7 0.5-0.6 0.7-1 1-1.7 0.3-0.7 0.2-1.3-0.1-1.8s-2.4-5.8-3.3-7.9c-0.9-2-1.8-1.7-2.4-1.7h-2.1c-0.7 0-1.9 0.3-2.9 1.4-1 1.1-3.8 3.7-3.8 9 0 5.3 3.9 10.4 4.4 11.1 0.6 0.7 7.6 11.6 18.4 16.3 2.6 1.1 4.6 1.8 6.2 2.3 2.6 0.8 5 0.7 6.9 0.4 2.1-0.3 6.5-2.7 7.4-5.2 0.9-2.6 0.9-4.8 0.6-5.3-0.3-0.4-1.1-0.7-2.1-1.2z" fill="#ffffff"/>
      </svg>`
    )}`
  },
  {
    id: 'instagram',
    name: 'Instagram',
    dataUrl: `data:image/svg+xml;utf8,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
        <defs>
          <linearGradient id="ig" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#fdf497"/>
            <stop offset="25%" stop-color="#fd5949"/>
            <stop offset="50%" stop-color="#d6249f"/>
            <stop offset="100%" stop-color="#285AEB"/>
          </linearGradient>
        </defs>
        <rect width="100" height="100" rx="25" fill="url(#ig)"/>
        <rect x="22" y="22" width="56" height="56" rx="16" fill="none" stroke="#ffffff" stroke-width="6"/>
        <circle cx="50" cy="50" r="14" fill="none" stroke="#ffffff" stroke-width="6"/>
        <circle cx="67" cy="33" r="3.5" fill="#ffffff"/>
      </svg>`
    )}`
  },
  {
    id: 'youtube',
    name: 'YouTube',
    dataUrl: `data:image/svg+xml;utf8,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
        <rect width="100" height="100" rx="24" fill="#FF0000"/>
        <path d="M40 33 L68 50 L40 67 Z" fill="#ffffff"/>
      </svg>`
    )}`
  },
  {
    id: 'wifi',
    name: 'Wi-Fi',
    dataUrl: `data:image/svg+xml;utf8,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
        <circle cx="50" cy="50" r="48" fill="#2563eb"/>
        <path d="M22 36 A40 40 0 0 1 78 36 M30 46 A28 28 0 0 1 70 46 M39 57 A16 16 0 0 1 61 57" fill="none" stroke="#ffffff" stroke-width="7" stroke-linecap="round"/>
        <circle cx="50" cy="69" r="4.5" fill="#ffffff"/>
      </svg>`
    )}`
  },
  {
    id: 'phone',
    name: 'Phone Call',
    dataUrl: `data:image/svg+xml;utf8,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
        <circle cx="50" cy="50" r="48" fill="#059669"/>
        <path d="M34 32 c1.5-3 5-3.5 7.5-1.5 l5 4 c2 1.5 2.5 4.5 1 6.5 l-2.5 3 c2.5 4.5 6 8 10.5 10.5 l3-2.5 c2-1.5 5-1 6.5 1 l4 5 c2 2.5 1.5 6-1.5 7.5 -7 3.5-17.5-0.5-27-10 -9.5-9.5-13.5-20-6.5-23.5 z" fill="#ffffff"/>
      </svg>`
    )}`
  },
  {
    id: 'mail',
    name: 'Email',
    dataUrl: `data:image/svg+xml;utf8,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
        <circle cx="50" cy="50" r="48" fill="#7c3aed"/>
        <rect x="24" y="32" width="52" height="36" rx="6" fill="#ffffff"/>
        <path d="M26 34 L50 52 L74 34" fill="none" stroke="#7c3aed" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`
    )}`
  },
  {
    id: 'website',
    name: 'Website / Web',
    dataUrl: `data:image/svg+xml;utf8,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
        <circle cx="50" cy="50" r="48" fill="#0284c7"/>
        <circle cx="50" cy="50" r="28" fill="none" stroke="#ffffff" stroke-width="5"/>
        <line x1="22" y1="50" x2="78" y2="50" stroke="#ffffff" stroke-width="5"/>
        <ellipse cx="50" cy="50" rx="14" ry="28" fill="none" stroke="#ffffff" stroke-width="5"/>
      </svg>`
    )}`
  },
  {
    id: 'location',
    name: 'Location Map',
    dataUrl: `data:image/svg+xml;utf8,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
        <circle cx="50" cy="50" r="48" fill="#dc2626"/>
        <path d="M50 24 c-10 0-18 8-18 18 0 14 18 32 18 32 s18-18 18-32 c0-10-8-18-18-18 z" fill="#ffffff"/>
        <circle cx="50" cy="42" r="6" fill="#dc2626"/>
      </svg>`
    )}`
  },
  {
    id: 'cart',
    name: 'Shopping Cart',
    dataUrl: `data:image/svg+xml;utf8,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
        <circle cx="50" cy="50" r="48" fill="#ea580c"/>
        <path d="M26 30 h10 l8 25 h26 l7-20 h-45" fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="45" cy="65" r="4.5" fill="#ffffff"/>
        <circle cx="67" cy="65" r="4.5" fill="#ffffff"/>
      </svg>`
    )}`
  }
];

// --- Frame Types & Templates ---
export type FrameStyle = 
  | 'none'
  | 'header-banner'
  | 'bottom-tag'
  | 'polaroid'
  | 'countertop'
  | 'coupon'
  | 'smartphone'
  | 'circular-seal';

interface FrameOption {
  id: FrameStyle;
  name: string;
  desc: string;
  defaultText: string;
  defaultSubtext: string;
  icon: typeof LayoutTemplate;
}

const FRAME_OPTIONS: FrameOption[] = [
  {
    id: 'none',
    name: 'No Frame (Clean)',
    desc: 'Pure QR Code with borderless minimalism',
    defaultText: '',
    defaultSubtext: '',
    icon: QrCode
  },
  {
    id: 'header-banner',
    name: 'Top Header Banner',
    desc: 'High-contrast header banner on top with CTA',
    defaultText: 'SCAN ME',
    defaultSubtext: 'Point camera to scan',
    icon: LayoutTemplate
  },
  {
    id: 'bottom-tag',
    name: 'Bottom Tag Pill',
    desc: 'Sleek card with eye-catching pill button',
    defaultText: 'SCAN ME',
    defaultSubtext: 'Camera or QR Reader',
    icon: Tag
  },
  {
    id: 'polaroid',
    name: 'Polaroid Card',
    desc: 'Photo card layout with custom caption text',
    defaultText: 'Scan To Connect',
    defaultSubtext: 'Fast & Instant Access',
    icon: LayoutTemplate
  },
  {
    id: 'countertop',
    name: 'Payment / Desk Stand',
    desc: 'Retail countertop stand for UPI & store desks',
    defaultText: 'SCAN & PAY HERE',
    defaultSubtext: 'Safe • Instant • Verified',
    icon: Store
  },
  {
    id: 'coupon',
    name: 'Coupon / Voucher Ticket',
    desc: 'Dashed voucher border with discount badge',
    defaultText: 'SPECIAL OFFER',
    defaultSubtext: 'Scan to redeem discount',
    icon: Ticket
  },
  {
    id: 'smartphone',
    name: 'Smartphone Mockup',
    desc: 'Modern phone bezel frame with speaker notch',
    defaultText: 'DIGITAL PASS',
    defaultSubtext: 'Scan on screen',
    icon: Smartphone
  },
  {
    id: 'circular-seal',
    name: 'Stamp / Circular Seal',
    desc: 'Framed badge emblem for products & labels',
    defaultText: 'VERIFIED QR',
    defaultSubtext: 'Official Scan',
    icon: Award
  }
];

const QUICK_CTA_SUGGESTIONS = [
  'SCAN ME',
  'SCAN TO PAY',
  'VISIT WEBSITE',
  'VIEW OUR MENU',
  'CONNECT WI-FI',
  'FOLLOW US',
  'GET SPECIAL OFFER',
  'DOWNLOAD APP',
  'CONTACT US'
];

export default function QrGenerator() {
  // Navigation tabs in sidebar
  const [activeSidebarTab, setActiveSidebarTab] = useState<'content' | 'frames' | 'shapes' | 'colors' | 'logo' | 'security' | 'settings'>('content');

  // --- 1. Content / Payload State ---
  const [type, setType] = useState('url');
  const [value, setValue] = useState('https://loveyoutools.in');
  const [upiType, setUpiType] = useState<'vpa' | 'account'>('vpa');
  const [copiedPayload, setCopiedPayload] = useState(false);
  const [fastScanToast, setFastScanToast] = useState(false);

  // --- Password Encryption State ---
  const [isEncrypted, setIsEncrypted] = useState(false);
  const [qrPassword, setQrPassword] = useState('');
  const [showQrPassword, setShowQrPassword] = useState(false);
  const [passwordHint, setPasswordHint] = useState('');
  const [encryptedPayload, setEncryptedPayload] = useState('');
  const [encryptionDelivery, setEncryptionDelivery] = useState<'web-unlock' | 'raw-cipher'>('web-unlock');
  const [isEncrypting, setIsEncrypting] = useState(false);

  // Decryption / Unlock Modal State (For recipients scanning or testing)
  const [unlockModalOpen, setUnlockModalOpen] = useState(false);
  const [unlockCipherInput, setUnlockCipherInput] = useState('');
  const [unlockHintText, setUnlockHintText] = useState('');
  const [unlockPasswordInput, setUnlockPasswordInput] = useState('');
  const [showUnlockPassword, setShowUnlockPassword] = useState(false);
  const [decryptedResult, setDecryptedResult] = useState<string | null>(null);
  const [unlockError, setUnlockError] = useState('');
  const [isDecryptingQr, setIsDecryptingQr] = useState(false);
  const [copiedDecrypted, setCopiedDecrypted] = useState(false);

  // Check URL query parameters on load (e.g. when mobile camera opens ?unlock=...)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const unlockParam = params.get('unlock');
      const hintParam = params.get('hint');
      if (unlockParam) {
        setUnlockCipherInput(unlockParam);
        if (hintParam) setUnlockHintText(hintParam);
        setUnlockModalOpen(true);
      }
    }
  }, []);

  // Auto-encrypt content whenever value, password, hint, or mode changes
  useEffect(() => {
    let isCurrent = true;
    if (isEncrypted && qrPassword.trim() && value.trim()) {
      setIsEncrypting(true);
      encryptPayload(value.trim(), qrPassword.trim())
        .then((cipher) => {
          if (!isCurrent) return;
          if (encryptionDelivery === 'web-unlock') {
            const origin = typeof window !== 'undefined' ? window.location.origin : 'https://loveyoutools.in';
            const hintPart = passwordHint.trim() ? `&hint=${encodeURIComponent(passwordHint.trim())}` : '';
            setEncryptedPayload(`${origin}/tool/qr-code-generator?unlock=${cipher}${hintPart}`);
          } else {
            setEncryptedPayload(`ENCRYPTED:${cipher}`);
          }
          setIsEncrypting(false);
        })
        .catch((err) => {
          console.error('Encryption failed:', err);
          if (isCurrent) setIsEncrypting(false);
        });
    } else {
      setEncryptedPayload('');
      setIsEncrypting(false);
    }
    return () => {
      isCurrent = false;
    };
  }, [value, isEncrypted, qrPassword, passwordHint, encryptionDelivery]);

  // Execute Decryption
  const handlePerformUnlock = async (overrideCipher?: string, overridePwd?: string) => {
    const cipherToUse = (overrideCipher !== undefined ? overrideCipher : unlockCipherInput).trim();
    const pwdToUse = (overridePwd !== undefined ? overridePwd : unlockPasswordInput).trim();

    if (!cipherToUse) {
      setUnlockError('Encrypted payload is missing.');
      return;
    }
    if (!pwdToUse) {
      setUnlockError('Please enter the password to decrypt.');
      return;
    }

    setIsDecryptingQr(true);
    setUnlockError('');
    setDecryptedResult(null);

    try {
      // Strip ENCRYPTED: prefix if present
      let cleanCipher = cipherToUse;
      if (cleanCipher.startsWith('ENCRYPTED:')) {
        cleanCipher = cleanCipher.replace('ENCRYPTED:', '');
      } else if (cleanCipher.includes('unlock=')) {
        try {
          const u = new URL(cleanCipher);
          cleanCipher = u.searchParams.get('unlock') || cleanCipher;
        } catch {
          const match = cleanCipher.match(/unlock=([^&]+)/);
          if (match) cleanCipher = match[1];
        }
      }

      const decrypted = await decryptPayload(cleanCipher, pwdToUse);
      setDecryptedResult(decrypted);
    } catch (err: any) {
      console.error('Decryption failed:', err);
      setUnlockError('Incorrect password! Unable to decrypt this QR code.');
    } finally {
      setIsDecryptingQr(false);
    }
  };

  // Open unlock modal to test current encryption
  const handleOpenTestUnlock = () => {
    if (isEncrypted && encryptedPayload) {
      let cipherVal = encryptedPayload;
      if (cipherVal.startsWith('ENCRYPTED:')) {
        cipherVal = cipherVal.replace('ENCRYPTED:', '');
      } else if (cipherVal.includes('unlock=')) {
        try {
          const u = new URL(cipherVal);
          cipherVal = u.searchParams.get('unlock') || cipherVal;
        } catch {
          const match = cipherVal.match(/unlock=([^&]+)/);
          if (match) cipherVal = match[1];
        }
      }
      setUnlockCipherInput(cipherVal);
      setUnlockHintText(passwordHint);
      setUnlockPasswordInput(qrPassword); // Pre-fill with current password for convenience
      setDecryptedResult(null);
      setUnlockError('');
      setUnlockModalOpen(true);
    }
  };

  // --- 2. Frame Customization State ---
  const [frameStyle, setFrameStyle] = useState<FrameStyle>('none');
  const [frameText, setFrameText] = useState('SCAN ME');
  const [frameSubtext, setFrameSubtext] = useState('Point camera to scan');
  const [frameColor, setFrameColor] = useState('#1d4ed8');
  const [syncFrameWithQr, setSyncFrameWithQr] = useState(true);
  const [frameTextColor, setFrameTextColor] = useState('#ffffff');

  // --- 3. Shape & Dot Style State ---
  const [dotsType, setDotsType] = useState<DotType>('square');
  const [cornersSquareType, setCornersSquareType] = useState<CornerSquareType>('square');
  const [cornersDotType, setCornersDotType] = useState<CornerDotType>('square');
  const [qrShape, setQrShape] = useState<ShapeType>('square');
  const [customEyeColor, setCustomEyeColor] = useState(false);
  const [eyeColor, setEyeColor] = useState('#1d4ed8');

  // --- 4. Color & Gradient State ---
  const [fgColor, setFgColor] = useState('#000000');
  const [fgColor2, setFgColor2] = useState('#1d4ed8');
  const [isGradient, setIsGradient] = useState(false);
  const [gradientType, setGradientType] = useState<GradientType>('linear');
  const [bgColor, setBgColor] = useState('#ffffff');
  const [isTransparentBg, setIsTransparentBg] = useState(false);
  const [colorMode, setColorMode] = useState<'presets' | 'custom'>('custom');

  // --- 5. Logo & Image State ---
  const [logoImage, setLogoImage] = useState<string | null>(null);
  const [logoSize, setLogoSize] = useState(45); // px
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- 6. General QR Code Settings ---
  const [size, setSize] = useState(280);
  const [level, setLevel] = useState<'L' | 'M' | 'Q' | 'H'>('M');
  const [includeMargin, setIncludeMargin] = useState(true);
  const [marginSize, setMarginSize] = useState(4); // 4 modules ISO standard
  const [downloadFormat, setDownloadFormat] = useState<'png' | 'svg' | 'jpeg'>('png');

  // Print Sheet Modal State (Multiple copies across different paper sizes)
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [printModalItemImage, setPrintModalItemImage] = useState<string>('');

  // Refs for qr-code-styling DOM mount and canvas exports
  const qrContainerRef = useRef<HTMLDivElement>(null);
  const qrCodeInstance = useRef<QRCodeStyling | null>(null);
  const exportCanvasRef = useRef<HTMLCanvasElement>(null);

  // Effective frame color (auto sync with QR color or custom)
  const effectiveFrameColor = syncFrameWithQr ? fgColor : frameColor;

  // Auto switch QR error correction to H if a logo is added (to ensure data recovery),
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
    if (isTransparentBg) return 21;
    const l1 = getLuminance(fgColor);
    const l2 = getLuminance(bgColor);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
  }, [fgColor, bgColor, isTransparentBg]);

  const isDarkOnLight = useMemo(() => {
    if (isTransparentBg) return true;
    return getLuminance(fgColor) < getLuminance(bgColor);
  }, [fgColor, bgColor, isTransparentBg]);

  // Scan Speed Score (0 to 100)
  const scanSpeedScore = useMemo(() => {
    let score = 0;
    // Contrast contribution
    if (contrastRatio >= 7) score += 35;
    else if (contrastRatio >= 4.5) score += 25;
    else if (contrastRatio >= 2.5) score += 15;
    else score += 5;

    // Dark-on-light orientation
    if (isDarkOnLight) score += 20;

    // Quiet zone margin
    if (includeMargin && marginSize >= 4) score += 20;
    else if (includeMargin && marginSize >= 2) score += 10;
    else score += 0;

    // Dots styling safety (square is fastest, round is high, classy is moderate)
    if (dotsType === 'square') score += 15;
    else if (dotsType === 'dots' || dotsType === 'rounded') score += 12;
    else score += 8;

    // Error correction level
    if (!logoImage && level === 'M') score += 10;
    else if (logoImage && level === 'H') score += 10;
    else score += 5;

    return Math.min(100, score);
  }, [contrastRatio, isDarkOnLight, includeMargin, marginSize, dotsType, logoImage, level]);

  // 1-Click Fast Scan Optimizer
  const handleOptimizeFastScan = () => {
    setFgColor('#000000');
    setBgColor('#ffffff');
    setIsTransparentBg(false);
    setIsGradient(false);
    setDotsType('square');
    setCornersSquareType('square');
    setCornersDotType('square');
    setQrShape('square');
    setCustomEyeColor(false);
    setLevel(logoImage ? 'H' : 'M');
    setIncludeMargin(true);
    setMarginSize(4);
    setSize(280);
    setFastScanToast(true);
    setTimeout(() => setFastScanToast(false), 2500);
  };

  // Color actions
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
    setIsGradient(false);
    setCustomEyeColor(false);
  };

  const handleApplyPreset = (preset: ColorPreset) => {
    setFgColor(preset.fg);
    setBgColor(preset.bg);
    setIsTransparentBg(false);
    setIsGradient(false);
  };

  // Build options object for QRCodeStyling
  const qrOptions = useMemo(() => {
    const rawData = isEncrypted && qrPassword.trim() && encryptedPayload 
      ? encryptedPayload 
      : (value.trim() || 'https://loveyoutools.in');
    const effectiveBg = isTransparentBg ? 'transparent' : bgColor;

    return {
      width: size,
      height: size,
      type: 'canvas' as const,
      data: rawData,
      shape: qrShape,
      margin: includeMargin ? marginSize * 4 : 0,
      qrOptions: {
        typeNumber: 0 as const,
        mode: undefined,
        errorCorrectionLevel: level,
      },
      image: logoImage || undefined,
      imageOptions: {
        hideBackgroundDots: true,
        imageSize: Math.min(0.38, Math.max(0.18, logoSize / size)),
        margin: 4,
        crossOrigin: 'anonymous',
        saveAsBlob: true
      },
      dotsOptions: {
        color: fgColor,
        type: dotsType,
        gradient: isGradient ? {
          type: gradientType,
          rotation: 0,
          colorStops: [
            { offset: 0, color: fgColor },
            { offset: 1, color: fgColor2 }
          ]
        } : undefined
      },
      cornersSquareOptions: {
        color: customEyeColor ? eyeColor : (isGradient ? fgColor : fgColor),
        type: cornersSquareType,
      },
      cornersDotOptions: {
        color: customEyeColor ? eyeColor : (isGradient ? fgColor2 : fgColor),
        type: cornersDotType,
      },
      backgroundOptions: {
        color: effectiveBg,
        round: qrShape === 'circle' ? 1 : 0
      }
    };
  }, [
    size, value, isEncrypted, qrPassword, encryptedPayload, qrShape, includeMargin, marginSize, level, logoImage, logoSize,
    fgColor, fgColor2, isGradient, gradientType, dotsType, customEyeColor,
    eyeColor, cornersSquareType, cornersDotType, isTransparentBg, bgColor
  ]);

  // Mount or update QRCodeStyling instance
  useEffect(() => {
    if (!qrContainerRef.current) return;

    if (!qrCodeInstance.current) {
      qrCodeInstance.current = new QRCodeStyling(qrOptions);
      qrContainerRef.current.innerHTML = '';
      qrCodeInstance.current.append(qrContainerRef.current);
    } else {
      qrCodeInstance.current.update(qrOptions);
    }
  }, [qrOptions]);

  // Helper function: Render framed QR code onto an export canvas at high resolution
  const renderFramedToCanvas = useCallback(async (targetScale = 2): Promise<HTMLCanvasElement | null> => {
    if (!qrContainerRef.current) return null;
    const qrCanvas = qrContainerRef.current.querySelector('canvas');
    if (!qrCanvas) return null;

    // High resolution canvas
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const qrW = size * targetScale;
    const qrH = size * targetScale;

    // Helper: draw rounded rect
    const drawRoundRect = (
      c: CanvasRenderingContext2D,
      x: number,
      y: number,
      w: number,
      h: number,
      r: number
    ) => {
      c.beginPath();
      c.moveTo(x + r, y);
      c.lineTo(x + w - r, y);
      c.quadraticCurveTo(x + w, y, x + w, y + r);
      c.lineTo(x + w, y + h - r);
      c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      c.lineTo(x + r, y + h);
      c.quadraticCurveTo(x, y + h, x, y + h - r);
      c.lineTo(x, y + r);
      c.quadraticCurveTo(x, y, x + r, y);
      c.closePath();
    };

    if (frameStyle === 'none') {
      canvas.width = qrW;
      canvas.height = qrH;
      if (!isTransparentBg) {
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, qrW, qrH);
      }
      ctx.drawImage(qrCanvas, 0, 0, qrW, qrH);
      return canvas;
    }

    const padding = 36 * targetScale;
    const bannerH = 64 * targetScale;
    const subtextH = frameSubtext ? 32 * targetScale : 0;

    let canvasW = qrW + padding * 2;
    let canvasH = qrH + padding * 2;
    let qrX = padding;
    let qrY = padding;

    if (frameStyle === 'header-banner') {
      canvasH = qrH + bannerH + subtextH + padding * 2.2;
      qrY = bannerH + padding * 1.1;
    } else if (frameStyle === 'bottom-tag') {
      canvasH = qrH + bannerH + padding * 2.2;
      qrY = padding;
    } else if (frameStyle === 'polaroid') {
      canvasH = qrH + 90 * targetScale + padding * 1.5;
      qrY = padding;
    } else if (frameStyle === 'countertop') {
      canvasH = qrH + bannerH + 50 * targetScale + padding * 2;
      qrY = bannerH + padding;
    } else if (frameStyle === 'coupon') {
      canvasH = qrH + 70 * targetScale + padding * 2;
      qrY = 50 * targetScale + padding * 0.8;
    } else if (frameStyle === 'smartphone') {
      canvasH = qrH + 80 * targetScale + padding * 2;
      qrY = 46 * targetScale + padding;
    } else if (frameStyle === 'circular-seal') {
      const radius = (Math.max(qrW, qrH) / 2) + padding * 1.2;
      canvasW = radius * 2;
      canvasH = radius * 2;
      qrX = (canvasW - qrW) / 2;
      qrY = (canvasH - qrH) / 2;
    }

    canvas.width = canvasW;
    canvas.height = canvasH;

    // Draw Background
    if (frameStyle === 'circular-seal') {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(canvasW / 2, canvasH / 2, canvasW / 2 - 4, 0, Math.PI * 2);
      ctx.fill();

      // Outer accent rings
      ctx.strokeStyle = effectiveFrameColor;
      ctx.lineWidth = 8 * targetScale;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(canvasW / 2, canvasH / 2, canvasW / 2 - 20 * targetScale, 0, Math.PI * 2);
      ctx.strokeStyle = effectiveFrameColor + '40';
      ctx.lineWidth = 3 * targetScale;
      ctx.stroke();
    } else {
      // Card background
      drawRoundRect(ctx, 4, 4, canvasW - 8, canvasH - 8, 20 * targetScale);
      ctx.fillStyle = '#ffffff';
      ctx.fill();

      // Card border
      ctx.strokeStyle = frameStyle === 'coupon' ? effectiveFrameColor : '#e2e8f0';
      ctx.lineWidth = frameStyle === 'coupon' ? 4 * targetScale : 2 * targetScale;
      if (frameStyle === 'coupon') {
        ctx.setLineDash([10 * targetScale, 6 * targetScale]);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Draw Frame Specifics
    if (frameStyle === 'header-banner') {
      // Top header banner
      ctx.fillStyle = effectiveFrameColor;
      drawRoundRect(ctx, 4, 4, canvasW - 8, bannerH, 18 * targetScale);
      ctx.fill();
      // Straighten bottom corners of header
      ctx.fillRect(4, bannerH - 12 * targetScale, canvasW - 8, 12 * targetScale);

      // Banner Text
      ctx.fillStyle = frameTextColor;
      ctx.font = `900 ${22 * targetScale}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(frameText.toUpperCase(), canvasW / 2, bannerH / 2 + 2);

      // Subtext below QR
      if (frameSubtext) {
        ctx.fillStyle = '#64748b';
        ctx.font = `600 ${13 * targetScale}px Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(frameSubtext, canvasW / 2, canvasH - padding * 0.9);
      }
    } else if (frameStyle === 'bottom-tag') {
      // Bottom pill badge
      const pillW = Math.min(canvasW - padding * 1.5, 260 * targetScale);
      const pillH = 46 * targetScale;
      const pillX = (canvasW - pillW) / 2;
      const pillY = canvasH - pillH - padding * 0.8;

      ctx.fillStyle = effectiveFrameColor;
      drawRoundRect(ctx, pillX, pillY, pillW, pillH, pillH / 2);
      ctx.fill();

      // Pill Text
      ctx.fillStyle = frameTextColor;
      ctx.font = `900 ${18 * targetScale}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(frameText.toUpperCase(), canvasW / 2, pillY + pillH / 2);
    } else if (frameStyle === 'polaroid') {
      // Bottom Title
      ctx.fillStyle = '#0f172a';
      ctx.font = `900 ${24 * targetScale}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(frameText, canvasW / 2, canvasH - 52 * targetScale);

      // Subtitle
      if (frameSubtext) {
        ctx.fillStyle = '#64748b';
        ctx.font = `600 ${13 * targetScale}px Inter, sans-serif`;
        ctx.fillText(frameSubtext, canvasW / 2, canvasH - 24 * targetScale);
      }
    } else if (frameStyle === 'countertop') {
      // Countertop header
      ctx.fillStyle = effectiveFrameColor;
      ctx.fillRect(4, 4, canvasW - 8, bannerH);
      ctx.fillStyle = frameTextColor;
      ctx.font = `900 ${20 * targetScale}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(frameText.toUpperCase(), canvasW / 2, bannerH / 2);

      // Footer
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(4, canvasH - 46 * targetScale, canvasW - 8, 42 * targetScale);
      ctx.fillStyle = '#047857';
      ctx.font = `800 ${13 * targetScale}px Inter, sans-serif`;
      ctx.fillText('✓ ' + (frameSubtext || 'Instant & Verified Payment'), canvasW / 2, canvasH - 24 * targetScale);
    } else if (frameStyle === 'coupon') {
      // Coupon top badge
      ctx.fillStyle = effectiveFrameColor;
      drawRoundRect(ctx, (canvasW - 220 * targetScale) / 2, 8 * targetScale, 220 * targetScale, 36 * targetScale, 8 * targetScale);
      ctx.fill();

      ctx.fillStyle = frameTextColor;
      ctx.font = `900 ${14 * targetScale}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('★ ' + frameText.toUpperCase() + ' ★', canvasW / 2, 26 * targetScale);

      // Subtext
      if (frameSubtext) {
        ctx.fillStyle = '#64748b';
        ctx.font = `700 ${13 * targetScale}px Inter, sans-serif`;
        ctx.fillText(frameSubtext, canvasW / 2, canvasH - 20 * targetScale);
      }
    } else if (frameStyle === 'smartphone') {
      // Phone speaker notch
      ctx.fillStyle = '#0f172a';
      drawRoundRect(ctx, (canvasW - 90 * targetScale) / 2, 14 * targetScale, 90 * targetScale, 8 * targetScale, 4 * targetScale);
      ctx.fill();

      // Home indicator bar at bottom
      drawRoundRect(ctx, (canvasW - 120 * targetScale) / 2, canvasH - 18 * targetScale, 120 * targetScale, 5 * targetScale, 3 * targetScale);
      ctx.fill();

      // Top title
      ctx.fillStyle = '#0f172a';
      ctx.font = `800 ${15 * targetScale}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(frameText.toUpperCase(), canvasW / 2, 38 * targetScale);
    }

    // Draw the QR Code into the center slot
    ctx.drawImage(qrCanvas, qrX, qrY, qrW, qrH);

    return canvas;
  }, [
    size, frameStyle, frameText, frameSubtext, effectiveFrameColor, frameTextColor,
    isTransparentBg, bgColor
  ]);

  // Handle Download (PNG / SVG / JPEG)
  const handleDownloadQr = async () => {
    if (downloadFormat === 'svg' && frameStyle === 'none' && qrCodeInstance.current) {
      await qrCodeInstance.current.download({ name: `qr-code-${Date.now()}`, extension: 'svg' });
      return;
    }

    const canvas = await renderFramedToCanvas(2);
    if (!canvas) return;

    const mimeType = downloadFormat === 'jpeg' ? 'image/jpeg' : 'image/png';
    const dataUrl = canvas.toDataURL(mimeType, 0.98);
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `qr-designed-${Date.now()}.${downloadFormat === 'svg' ? 'png' : downloadFormat}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Open Multi-Copy Sheet Printing Modal
  const handleOpenPrintSheet = async () => {
    const canvas = await renderFramedToCanvas(2.5);
    if (!canvas) return;
    setPrintModalItemImage(canvas.toDataURL('image/png'));
    setPrintModalOpen(true);
  };

  // Logo upload
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

  const handleCopyImage = async () => {
    try {
      const canvas = await renderFramedToCanvas(2);
      if (!canvas) return;
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob })
        ]);
        alert('QR code image copied to clipboard!');
      });
    } catch {
      // Fallback
      alert('Could not copy image directly. Please use Download.');
    }
  };

  // Render input fields for selected data type
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
      case 'sms':
        return (
          <div className="fg" key="type-sms">
            <label className="fl">SMS Phone Number</label>
            <input 
              key="input-sms-num"
              type="tel" 
              className="fi mb-2" 
              value={(value || '').split(':')[1] || ''} 
              onChange={(e) => {
                const parts = value.split(':');
                const body = parts[2] || '';
                setValue(`smsto:${e.target.value}:${body}`);
              }} 
              placeholder="+1234567890" 
            />
            <label className="fl">Pre-filled Message</label>
            <textarea 
              key="textarea-sms-body"
              className="fta min-h-[70px]" 
              value={(value || '').split(':')[2] || ''} 
              onChange={(e) => {
                const parts = value.split(':');
                const num = parts[1] || '';
                setValue(`smsto:${num}:${e.target.value}`);
              }} 
              placeholder="Hi, I am interested in..." 
            />
          </div>
        );
      case 'vcard': {
        const vcardName = (value || '').match(/FN:(.*?)\n/)?.[1] || '';
        const vcardPhone = (value || '').match(/TEL:(.*?)\n/)?.[1] || '';
        const vcardEmail = (value || '').match(/EMAIL:(.*?)\n/)?.[1] || '';
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
                setValue(`BEGIN:VCARD\nVERSION:3.0\nFN:${e.target.value}\nTEL:${vcardPhone}\nEMAIL:${vcardEmail}\nEND:VCARD`);
              }} 
            />
            <label className="fl">Phone</label>
            <input 
              key="input-vcard-phone"
              type="tel" 
              className="fi mb-2" 
              value={vcardPhone} 
              placeholder="+1234567890" 
              onChange={(e) => {
                setValue(`BEGIN:VCARD\nVERSION:3.0\nFN:${vcardName}\nTEL:${e.target.value}\nEMAIL:${vcardEmail}\nEND:VCARD`);
              }} 
            />
            <label className="fl">Email</label>
            <input 
              key="input-vcard-email"
              type="email" 
              className="fi" 
              value={vcardEmail} 
              placeholder="john@example.com" 
              onChange={(e) => {
                setValue(`BEGIN:VCARD\nVERSION:3.0\nFN:${vcardName}\nTEL:${vcardPhone}\nEMAIL:${e.target.value}\nEND:VCARD`);
              }} 
            />
          </div>
        );
      }
      case 'whatsapp': {
        const waNum = (value || '').replace('https://wa.me/', '').split('?')[0] || '';
        const waText = decodeURIComponent((value || '').match(/text=(.*?)(&|$)/)?.[1] || '');
        return (
          <div className="fg" key="type-whatsapp">
            <label className="fl">WhatsApp Number (with Country Code)</label>
            <input 
              key="input-wa-num"
              type="tel" 
              className="fi mb-2" 
              value={waNum} 
              placeholder="919876543210" 
              onChange={(e) => {
                const textPart = waText ? `?text=${encodeURIComponent(waText)}` : '';
                setValue(`https://wa.me/${e.target.value.replace(/[^0-9]/g, '')}${textPart}`);
              }} 
            />
            <label className="fl">Default Message</label>
            <input 
              key="input-wa-text"
              type="text" 
              className="fi" 
              value={waText} 
              placeholder="Hello! I would like more information." 
              onChange={(e) => {
                const numPart = waNum.replace(/[^0-9]/g, '');
                const textPart = e.target.value ? `?text=${encodeURIComponent(e.target.value)}` : '';
                setValue(`https://wa.me/${numPart}${textPart}`);
              }} 
            />
          </div>
        );
      }
      case 'upi': {
        const paVal = (value || '').match(/pa=([^&]+)/)?.[1] || '';
        const payeeName = decodeURIComponent((value || '').match(/pn=([^&]+)/)?.[1] || '');
        const amount = (value || '').match(/am=([^&]+)/)?.[1] || '';
        return (
          <div className="fg" key="type-upi">
            <div className="flex gap-2 mb-3">
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
            
            <label className="fl">UPI ID (e.g. mobile@paytm, user@okaxis)</label>
            <input 
              key="input-upi-vpa"
              type="text" 
              className="fi mb-2" 
              value={paVal}
              placeholder="merchant@upi" 
              onChange={(e) => {
                setValue(`upi://pay?pa=${e.target.value}&pn=${encodeURIComponent(payeeName)}&am=${amount}&cu=INR`);
              }} 
            />
            
            <label className="fl">Payee / Store Name</label>
            <input 
              key="input-upi-payee"
              type="text" 
              className="fi mb-2" 
              value={payeeName}
              placeholder="My Store / Shop Name" 
              onChange={(e) => {
                setValue(`upi://pay?pa=${paVal}&pn=${encodeURIComponent(e.target.value)}&am=${amount}&cu=INR`);
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
                setValue(`upi://pay?pa=${paVal}&pn=${encodeURIComponent(payeeName)}&am=${e.target.value}&cu=INR`);
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

  return (
    <div className="tool-layout-container">
      {/* Hidden Offscreen Canvas for Rendering */}
      <canvas ref={exportCanvasRef} className="hidden" />

      {/* Left Controls (Sidebar) */}
      <aside className="tool-sidebar">
        <div className="sidebar-header p-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent">
              <QrCode className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-black tracking-tight">QR Code Designer</h2>
              <p className="text-[10px] text-text-muted">Custom frames, shapes, logo & fast scan</p>
            </div>
          </div>
          <span className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold border border-emerald-500/20">
            Designer Pro
          </span>
        </div>

        {/* Sidebar Navigation Tabs */}
        <div className="flex items-center gap-1 p-2 bg-bg-secondary/60 border-b border-border overflow-x-auto no-scrollbar">
          {[
            { id: 'content', label: 'Content', icon: LinkIcon },
            { id: 'security', label: 'Security', icon: Lock },
            { id: 'frames', label: 'Frames', icon: LayoutTemplate },
            { id: 'shapes', label: 'Shapes', icon: Shapes },
            { id: 'colors', label: 'Colors', icon: Palette },
            { id: 'logo', label: 'Logo', icon: ImageIcon },
            { id: 'settings', label: 'Settings', icon: Sliders },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveSidebarTab(tab.id as any)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                activeSidebarTab === tab.id
                  ? 'bg-accent text-white shadow-xs'
                  : 'text-text-secondary hover:text-text-primary hover:bg-surface'
              }`}
            >
              <tab.icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
              {tab.id === 'security' && isEncrypted && (
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              )}
            </button>
          ))}
        </div>

        <div className="sidebar-content custom-scrollbar p-5 space-y-6">
          {/* Fast Scan Optimizer Banner */}
          <div className="p-3 rounded-2xl bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-blue-500/10 border border-emerald-500/25 relative overflow-hidden">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-500 text-white flex items-center justify-center shadow-xs shrink-0">
                  <Zap className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h4 className="text-[11px] font-black text-text-primary flex items-center gap-1">
                    Scan Quality: {scanSpeedScore}/100
                  </h4>
                  <p className="text-[9px] text-text-muted">ISO standard & camera compatibility</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleOptimizeFastScan}
                className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black uppercase tracking-wider transition-all shadow-xs shrink-0 flex items-center gap-1 active:scale-95 cursor-pointer"
                title="Reset to 100% maximum speed scanning defaults"
              >
                <Sparkles className="w-3 h-3" /> Auto Fix
              </button>
            </div>
            {fastScanToast && (
              <div className="mt-2 text-[10px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1 animate-pulse">
                <Check className="w-3 h-3" /> Optimal instant scanning defaults applied!
              </div>
            )}
          </div>

          {/* TAB 1: CONTENT / DATA */}
          {activeSidebarTab === 'content' && (
            <div className="space-y-4">
              <h3 className="font-black text-[10px] uppercase tracking-widest flex items-center gap-2 text-text-muted">
                <Settings className="w-4 h-4 text-accent" /> Data Type
              </h3>
              <div className="grid grid-cols-3 gap-1.5">
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
                      else if (btn.id === 'upi') setValue('upi://pay?pa=store@upi&pn=Store&am=&cu=INR');
                      else if (btn.id === 'whatsapp') setValue('https://wa.me/919876543210');
                      else setValue(''); 
                    }} 
                    className={`btn ${type === btn.id ? 'bp' : 'bs2'} gap-1.5 text-[11px] py-1.5 px-2`}
                  >
                    <btn.icon className="w-3 h-3" /> {btn.label}
                  </button>
                ))}
              </div>
              <div className="mt-4">
                {renderQrInputs()}
              </div>

              {/* Quick Password Encryption Toggle in Content Tab */}
              <div className="p-3.5 rounded-2xl border border-border bg-bg-secondary/40 space-y-2 mt-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors ${
                      isEncrypted ? 'bg-amber-500 text-white shadow-xs' : 'bg-surface text-text-muted border border-border'
                    }`}>
                      <Lock className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-black text-text-primary flex items-center gap-1.5">
                        Password Encrypted QR
                        {isEncrypted && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                            AES-256
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-text-muted">Require a password to reveal QR code content</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const next = !isEncrypted;
                      setIsEncrypted(next);
                      if (next && !qrPassword) {
                        setActiveSidebarTab('security');
                      }
                    }}
                    className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer shrink-0 ${isEncrypted ? 'bg-amber-500' : 'bg-border'}`}
                  >
                    <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-xs transition-transform ${isEncrypted ? 'translate-x-5' : ''}`} />
                  </button>
                </div>

                {isEncrypted && (
                  <div className="pt-2 border-t border-border flex items-center justify-between text-[11px]">
                    <span className="text-text-muted truncate">
                      {qrPassword.trim() ? (
                        <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                          <Check className="w-3 h-3" /> Active & Protected
                        </span>
                      ) : (
                        <span className="text-amber-600 dark:text-amber-400 font-bold flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" /> Set password in Security
                        </span>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => setActiveSidebarTab('security')}
                      className="font-bold text-accent hover:underline flex items-center gap-1 cursor-pointer shrink-0"
                    >
                      <Key className="w-3 h-3" /> Configure Password
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB: SECURITY / PASSWORD ENCRYPTION */}
          {activeSidebarTab === 'security' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-black text-[10px] uppercase tracking-widest flex items-center gap-2 text-text-muted">
                  <Lock className="w-4 h-4 text-amber-500" /> Password Protection (AES-256)
                </h3>
                <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                  Client-Side Military Grade
                </span>
              </div>

              {/* Main Enable Switch */}
              <div className="p-4 rounded-2xl bg-surface border border-border shadow-2xs space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-xs font-black text-text-primary block">
                      Enable Password Encryption
                    </label>
                    <p className="text-[10px] text-text-muted mt-0.5">
                      Content is encrypted before encoding into QR. Scanners need the password to view.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsEncrypted(!isEncrypted)}
                    className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer shrink-0 ${isEncrypted ? 'bg-amber-500' : 'bg-border'}`}
                  >
                    <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-xs transition-transform ${isEncrypted ? 'translate-x-5' : ''}`} />
                  </button>
                </div>

                {isEncrypted && (
                  <div className="pt-3 border-t border-border space-y-3">
                    {/* Password Input */}
                    <div className="fg">
                      <div className="flex items-center justify-between mb-1">
                        <label className="fl flex items-center gap-1.5">
                          <Key className="w-3.5 h-3.5 text-amber-500" /> Secret Encryption Password *
                        </label>
                        {qrPassword.trim() && (
                          <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5">
                            <Check className="w-3 h-3" /> Ready
                          </span>
                        )}
                      </div>
                      <div className="relative">
                        <input
                          type={showQrPassword ? 'text' : 'password'}
                          value={qrPassword}
                          onChange={(e) => setQrPassword(e.target.value)}
                          placeholder="Enter strong password (e.g. MySecret#98)"
                          className="fi text-xs pr-10 font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => setShowQrPassword(!showQrPassword)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary cursor-pointer p-1"
                          title={showQrPassword ? 'Hide password' : 'Show password'}
                        >
                          {showQrPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      <p className="text-[10px] text-text-muted mt-1">
                        Encrypted with PBKDF2 (100,000 rounds) + AES-GCM 256-bit directly in your browser.
                      </p>
                    </div>

                    {/* Optional Password Hint */}
                    <div className="fg">
                      <label className="fl flex items-center gap-1.5">
                        <HelpCircle className="w-3.5 h-3.5 text-text-muted" /> Password Hint for Recipients (Optional)
                      </label>
                      <input
                        type="text"
                        value={passwordHint}
                        onChange={(e) => setPasswordHint(e.target.value)}
                        placeholder="e.g. My pet's name, or Room 402 Wi-Fi key"
                        className="fi text-xs"
                        maxLength={60}
                      />
                      <p className="text-[10px] text-text-muted mt-1">
                        The hint is visible to anyone scanning the code to help them remember the password.
                      </p>
                    </div>

                    {/* Recipient Delivery Mode */}
                    <div className="p-3 rounded-xl bg-bg-secondary/60 border border-border space-y-2">
                      <label className="text-xs font-bold text-text-secondary block">
                        Recipient Scanning Experience:
                      </label>
                      <div className="grid grid-cols-1 gap-1.5">
                        <button
                          type="button"
                          onClick={() => setEncryptionDelivery('web-unlock')}
                          className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-start gap-2.5 ${
                            encryptionDelivery === 'web-unlock'
                              ? 'border-accent bg-accent/10 ring-1 ring-accent'
                              : 'border-border bg-surface hover:bg-bg-secondary'
                          }`}
                        >
                          <div className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 mt-0.5 ${
                            encryptionDelivery === 'web-unlock' ? 'bg-accent text-white' : 'bg-bg-secondary text-text-muted'
                          }`}>
                            <ExternalLink className="w-3 h-3" />
                          </div>
                          <div>
                            <div className="text-xs font-bold text-text-primary flex items-center gap-1.5">
                              Mobile Camera Web Unlock (Recommended)
                              <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold">Best</span>
                            </div>
                            <div className="text-[10px] text-text-muted mt-0.5 leading-snug">
                              Standard iPhone/Android camera opens a built-in instant unlock page to enter password and reveal content.
                            </div>
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => setEncryptionDelivery('raw-cipher')}
                          className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-start gap-2.5 ${
                            encryptionDelivery === 'raw-cipher'
                              ? 'border-accent bg-accent/10 ring-1 ring-accent'
                              : 'border-border bg-surface hover:bg-bg-secondary'
                          }`}
                        >
                          <div className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 mt-0.5 ${
                            encryptionDelivery === 'raw-cipher' ? 'bg-accent text-white' : 'bg-bg-secondary text-text-muted'
                          }`}>
                            <Key className="w-3 h-3" />
                          </div>
                          <div>
                            <div className="text-xs font-bold text-text-primary">
                              Raw Encrypted Cipher (ENCRYPTED:...)
                            </div>
                            <div className="text-[10px] text-text-muted mt-0.5 leading-snug">
                              Direct Base64 encrypted cipher string. For internal systems or offline decryption apps.
                            </div>
                          </div>
                        </button>
                      </div>
                    </div>

                    {/* Test Decryption Trigger */}
                    <div className="pt-2 flex items-center justify-between">
                      <button
                        type="button"
                        onClick={handleOpenTestUnlock}
                        disabled={!qrPassword.trim() || !value.trim() || isEncrypting}
                        className="btn bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 gap-1.5 text-xs font-bold py-2 px-3 rounded-xl transition-all cursor-pointer disabled:opacity-50"
                      >
                        <Unlock className="w-3.5 h-3.5" /> Test Recipient Unlock
                      </button>
                      <span className="text-[10px] text-text-muted">
                        {isEncrypting ? 'Encrypting...' : 'Cipher Ready'}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Zero-Knowledge Privacy Note */}
              <div className="p-3 rounded-xl bg-blue-500/5 border border-blue-500/20 flex items-start gap-2.5">
                <ShieldCheck className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                <div className="text-[10px] text-text-secondary leading-snug">
                  <strong className="text-text-primary font-bold">100% Client-Side Privacy:</strong> Encryption uses the browser's native Web Crypto API (<code className="font-mono">SubtleCrypto</code>). Your data and password never leave your device.
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: FRAMES & CTA BANNERS */}
          {activeSidebarTab === 'frames' && (
            <div className="space-y-5">
              <div>
                <h3 className="font-black text-[10px] uppercase tracking-widest flex items-center gap-2 text-text-muted mb-3">
                  <LayoutTemplate className="w-4 h-4 text-accent" /> Frame Templates
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  {FRAME_OPTIONS.map((opt) => {
                    const isSelected = frameStyle === opt.id;
                    const IconComp = opt.icon;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          setFrameStyle(opt.id);
                          if (opt.defaultText && !frameText) setFrameText(opt.defaultText);
                          if (opt.defaultSubtext && !frameSubtext) setFrameSubtext(opt.defaultSubtext);
                        }}
                        className={`p-2.5 rounded-xl border text-left transition-all flex flex-col gap-1.5 cursor-pointer ${
                          isSelected
                            ? 'border-accent bg-accent/10 ring-1 ring-accent'
                            : 'border-border bg-surface hover:border-accent/40 hover:bg-bg-secondary'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${isSelected ? 'bg-accent text-white' : 'bg-bg-secondary text-text-muted'}`}>
                            <IconComp className="w-3.5 h-3.5" />
                          </div>
                          {isSelected && <Check className="w-3.5 h-3.5 text-accent" />}
                        </div>
                        <div>
                          <div className="text-[11px] font-black text-text-primary leading-tight">{opt.name}</div>
                          <div className="text-[9px] text-text-muted mt-0.5 line-clamp-1">{opt.desc}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {frameStyle !== 'none' && (
                <div className="space-y-4 pt-3 border-t border-border">
                  <div className="fg">
                    <label className="fl">Call To Action (CTA Text)</label>
                    <input
                      type="text"
                      className="fi text-xs font-bold"
                      value={frameText}
                      onChange={(e) => setFrameText(e.target.value)}
                      placeholder="SCAN ME"
                      maxLength={30}
                    />
                    {/* Quick CTA Suggestions */}
                    <div className="flex flex-wrap gap-1 mt-2">
                      {QUICK_CTA_SUGGESTIONS.map((txt) => (
                        <button
                          key={txt}
                          type="button"
                          onClick={() => setFrameText(txt)}
                          className="px-2 py-0.5 rounded-md bg-bg-secondary hover:bg-accent/10 hover:text-accent border border-border text-[9px] font-bold text-text-muted transition-colors cursor-pointer"
                        >
                          {txt}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="fg">
                    <label className="fl">Subtext / Secondary Line</label>
                    <input
                      type="text"
                      className="fi text-xs"
                      value={frameSubtext}
                      onChange={(e) => setFrameSubtext(e.target.value)}
                      placeholder="Point your camera to scan"
                      maxLength={40}
                    />
                  </div>

                  {/* Frame Colors */}
                  <div className="p-3 bg-bg-secondary/40 rounded-xl border border-border space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-text-secondary flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full border border-black/20" style={{ backgroundColor: effectiveFrameColor }} />
                        Frame Banner Color
                      </label>
                      <label className="flex items-center gap-1 text-[11px] font-bold text-accent cursor-pointer">
                        <input
                          type="checkbox"
                          checked={syncFrameWithQr}
                          onChange={(e) => setSyncFrameWithQr(e.target.checked)}
                          className="rounded text-accent focus:ring-0"
                        />
                        Match QR Color
                      </label>
                    </div>

                    {!syncFrameWithQr && (
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={frameColor.startsWith('#') ? frameColor : '#1d4ed8'}
                          onChange={(e) => setFrameColor(e.target.value)}
                          className="w-9 h-9 p-0.5 rounded-lg border border-border cursor-pointer bg-surface"
                        />
                        <input
                          type="text"
                          value={frameColor}
                          onChange={(e) => setFrameColor(e.target.value)}
                          className="fi text-xs font-mono py-1 flex-1"
                          placeholder="#1d4ed8"
                        />
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[11px] font-bold text-text-secondary">Banner Text Color:</span>
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => setFrameTextColor('#ffffff')}
                          className={`px-2 py-0.5 rounded-md text-[10px] font-bold border transition-all ${frameTextColor === '#ffffff' ? 'bg-accent text-white border-accent' : 'bg-surface text-text-muted border-border'}`}
                        >
                          White
                        </button>
                        <button
                          type="button"
                          onClick={() => setFrameTextColor('#000000')}
                          className={`px-2 py-0.5 rounded-md text-[10px] font-bold border transition-all ${frameTextColor === '#000000' ? 'bg-accent text-white border-accent' : 'bg-surface text-text-muted border-border'}`}
                        >
                          Dark
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: SHAPES & STYLES */}
          {activeSidebarTab === 'shapes' && (
            <div className="space-y-5">
              {/* Overall QR Code Shape */}
              <div>
                <label className="fl mb-2">Overall QR Shape</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setQrShape('square')}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                      qrShape === 'square'
                        ? 'bg-accent text-white border-accent shadow-xs'
                        : 'border-border bg-surface text-text-secondary hover:bg-bg-secondary'
                    }`}
                  >
                    <div className="w-3.5 h-3.5 border border-current rounded-xs" />
                    Square Shape
                  </button>
                  <button
                    type="button"
                    onClick={() => setQrShape('circle')}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                      qrShape === 'circle'
                        ? 'bg-accent text-white border-accent shadow-xs'
                        : 'border-border bg-surface text-text-secondary hover:bg-bg-secondary'
                    }`}
                  >
                    <div className="w-3.5 h-3.5 border border-current rounded-full" />
                    Circle Mask
                  </button>
                </div>
              </div>

              {/* Body Dots Pattern */}
              <div>
                <label className="fl mb-2">Body Dots Pattern</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'square', label: 'Square' },
                    { id: 'dots', label: 'Dots' },
                    { id: 'rounded', label: 'Rounded' },
                    { id: 'extra-rounded', label: 'Bubbles' },
                    { id: 'classy', label: 'Classy' },
                    { id: 'classy-rounded', label: 'Elegance' },
                  ].map((dot) => (
                    <button
                      key={dot.id}
                      type="button"
                      onClick={() => setDotsType(dot.id as DotType)}
                      className={`py-2 px-2 rounded-xl border text-[11px] font-bold transition-all text-center cursor-pointer ${
                        dotsType === dot.id
                          ? 'bg-accent text-white border-accent shadow-xs'
                          : 'border-border bg-surface text-text-secondary hover:border-accent/40'
                      }`}
                    >
                      {dot.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Corner Eye Outer Frame */}
              <div>
                <label className="fl mb-2">Corner Eyes Outer Frame</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'square', label: 'Square' },
                    { id: 'extra-rounded', label: 'Rounded' },
                    { id: 'dot', label: 'Circle' },
                  ].map((sq) => (
                    <button
                      key={sq.id}
                      type="button"
                      onClick={() => setCornersSquareType(sq.id as CornerSquareType)}
                      className={`py-2 px-2 rounded-xl border text-[11px] font-bold transition-all text-center cursor-pointer ${
                        cornersSquareType === sq.id
                          ? 'bg-accent text-white border-accent shadow-xs'
                          : 'border-border bg-surface text-text-secondary hover:border-accent/40'
                      }`}
                    >
                      {sq.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Corner Eye Inner Dot */}
              <div>
                <label className="fl mb-2">Corner Eyes Inner Ball</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'square', label: 'Square Box' },
                    { id: 'dot', label: 'Circle Ball' },
                  ].map((cd) => (
                    <button
                      key={cd.id}
                      type="button"
                      onClick={() => setCornersDotType(cd.id as CornerDotType)}
                      className={`py-2 px-2 rounded-xl border text-[11px] font-bold transition-all text-center cursor-pointer ${
                        cornersDotType === cd.id
                          ? 'bg-accent text-white border-accent shadow-xs'
                          : 'border-border bg-surface text-text-secondary hover:border-accent/40'
                      }`}
                    >
                      {cd.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Eye Colors */}
              <div className="p-3 bg-bg-secondary/40 rounded-xl border border-border space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-text-secondary">Custom Eye (Anchor) Color</label>
                  <label className="flex items-center gap-1 text-[11px] font-bold text-accent cursor-pointer">
                    <input
                      type="checkbox"
                      checked={customEyeColor}
                      onChange={(e) => setCustomEyeColor(e.target.checked)}
                      className="rounded text-accent focus:ring-0"
                    />
                    Enable
                  </label>
                </div>
                {customEyeColor && (
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="color"
                      value={eyeColor.startsWith('#') ? eyeColor : '#1d4ed8'}
                      onChange={(e) => setEyeColor(e.target.value)}
                      className="w-9 h-9 p-0.5 rounded-lg border border-border cursor-pointer bg-surface"
                    />
                    <input
                      type="text"
                      value={eyeColor}
                      onChange={(e) => setEyeColor(e.target.value)}
                      className="fi text-xs font-mono py-1 flex-1"
                      placeholder="#1d4ed8"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: COLORS & GRADIENTS */}
          {activeSidebarTab === 'colors' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-black text-[10px] uppercase tracking-widest flex items-center gap-2 text-text-muted">
                  <Palette className="w-4 h-4 text-accent" /> Color Customization
                </h3>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={handleSwapColors}
                    title="Swap Colors"
                    className="p-1 text-xs text-text-secondary hover:text-accent hover:bg-bg-secondary rounded-lg transition-colors flex items-center gap-1 border border-border cursor-pointer"
                  >
                    <ArrowLeftRight className="w-3 h-3" />
                    <span className="text-[10px] font-bold">Swap</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleResetColors}
                    title="Reset to Black & White"
                    className="p-1 text-xs text-text-secondary hover:text-red-500 hover:bg-bg-secondary rounded-lg transition-colors flex items-center gap-1 border border-border cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span className="text-[10px] font-bold">Reset</span>
                  </button>
                </div>
              </div>

              {/* Sub-tabs: Custom Colors vs Presets */}
              <div className="flex p-1 bg-bg-secondary rounded-xl border border-border text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setColorMode('custom')}
                  className={`flex-1 py-1.5 rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    colorMode === 'custom' ? 'bg-surface text-accent shadow-xs' : 'text-text-muted hover:text-text-secondary'
                  }`}
                >
                  <Palette className="w-3.5 h-3.5" /> Custom Colors
                </button>
                <button
                  type="button"
                  onClick={() => setColorMode('presets')}
                  className={`flex-1 py-1.5 rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    colorMode === 'presets' ? 'bg-surface text-accent shadow-xs' : 'text-text-muted hover:text-text-secondary'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" /> Designer Themes
                </button>
              </div>

              {colorMode === 'presets' ? (
                <div className="grid grid-cols-2 gap-2 max-h-[260px] overflow-y-auto pr-1 custom-scrollbar">
                  {COLOR_PRESETS.map((preset) => {
                    const isSelected = !isTransparentBg && fgColor.toLowerCase() === preset.fg.toLowerCase() && bgColor.toLowerCase() === preset.bg.toLowerCase();
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => handleApplyPreset(preset)}
                        className={`p-2 rounded-xl border text-left transition-all flex items-center gap-2 cursor-pointer ${
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
              ) : (
                <div className="space-y-3.5">
                  {/* Foreground / Gradient */}
                  <div className="p-3 bg-bg-secondary/40 rounded-xl border border-border space-y-2.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-text-secondary flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full border border-black/20" style={{ backgroundColor: fgColor }} />
                        Foreground Color
                      </label>
                      <label className="flex items-center gap-1 text-[11px] font-bold text-accent cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isGradient}
                          onChange={(e) => setIsGradient(e.target.checked)}
                          className="rounded text-accent focus:ring-0"
                        />
                        Gradient
                      </label>
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

                    {isGradient && (
                      <div className="space-y-2 pt-1 border-t border-border">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold text-text-secondary">Gradient End Color:</span>
                          <div className="flex gap-1 text-[10px]">
                            <button
                              type="button"
                              onClick={() => setGradientType('linear')}
                              className={`px-2 py-0.5 rounded border ${gradientType === 'linear' ? 'bg-accent text-white border-accent' : 'border-border'}`}
                            >
                              Linear
                            </button>
                            <button
                              type="button"
                              onClick={() => setGradientType('radial')}
                              className={`px-2 py-0.5 rounded border ${gradientType === 'radial' ? 'bg-accent text-white border-accent' : 'border-border'}`}
                            >
                              Radial
                            </button>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <input 
                            type="color" 
                            value={fgColor2.startsWith('#') ? fgColor2 : '#1d4ed8'} 
                            onChange={(e) => setFgColor2(e.target.value)}
                            className="w-9 h-9 p-0.5 rounded-lg border border-border cursor-pointer bg-surface"
                          />
                          <input 
                            type="text" 
                            value={fgColor2} 
                            onChange={(e) => setFgColor2(e.target.value)}
                            className="fi text-xs font-mono py-1.5 flex-1"
                            placeholder="#1d4ed8"
                          />
                        </div>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {FG_SWATCHES.map((swatch) => (
                        <button
                          key={swatch}
                          type="button"
                          onClick={() => setFgColor(swatch)}
                          style={{ backgroundColor: swatch }}
                          className={`w-5 h-5 rounded-md border border-black/20 transition-transform hover:scale-110 cursor-pointer ${fgColor.toLowerCase() === swatch.toLowerCase() ? 'ring-2 ring-accent scale-110' : ''}`}
                          title={swatch}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Background Color */}
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
                              className={`w-5 h-5 rounded-md border border-black/20 transition-transform hover:scale-110 cursor-pointer ${bgColor.toLowerCase() === swatch.toLowerCase() ? 'ring-2 ring-accent scale-110' : ''}`}
                              title={swatch}
                            />
                          ))}
                        </div>
                      </>
                    ) : (
                      <p className="text-[11px] text-text-muted italic bg-surface/50 p-2 rounded-lg border border-border/50">
                        Transparent background enabled.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 5: LOGO & ICONS */}
          {activeSidebarTab === 'logo' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-black text-[10px] uppercase tracking-widest flex items-center gap-2 text-text-muted">
                  <ImageIcon className="w-4 h-4 text-accent" /> Center Logo / Icon
                </h3>
                {logoImage && (
                  <button
                    type="button"
                    onClick={() => setLogoImage(null)}
                    className="text-[10px] font-bold text-red-500 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" /> Remove
                  </button>
                )}
              </div>

              {/* Upload Custom Logo Button */}
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleLogoUpload} 
                accept="image/*" 
                className="hidden" 
              />
              <button 
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-4 px-3 border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center gap-1 hover:border-accent hover:bg-accent/5 transition-all text-text-muted bg-surface cursor-pointer"
              >
                <ImageIcon className="w-5 h-5 text-accent" />
                <span className="text-[11px] font-bold text-text-primary">Upload Custom Logo (PNG / JPG / SVG)</span>
                <span className="text-[9px] text-text-muted">Auto-centers with quiet margin around icon</span>
              </button>

              {/* Preset Popular Brand Logos (1-Click) */}
              <div>
                <label className="fl mb-2">Or Choose Popular Preset Icon</label>
                <div className="grid grid-cols-5 gap-2">
                  {PRESET_LOGOS.map((plogo) => (
                    <button
                      key={plogo.id}
                      type="button"
                      onClick={() => setLogoImage(plogo.dataUrl)}
                      className="p-2 rounded-xl border border-border bg-surface hover:border-accent hover:bg-bg-secondary flex flex-col items-center justify-center gap-1 transition-all group cursor-pointer"
                      title={plogo.name}
                    >
                      <img src={plogo.dataUrl} alt={plogo.name} className="w-6 h-6 object-contain group-hover:scale-110 transition-transform" />
                      <span className="text-[8px] font-bold text-text-muted truncate w-full text-center">{plogo.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Logo Sizing */}
              {logoImage && (
                <div className="p-3 bg-bg-secondary/40 rounded-xl border border-border space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-bold text-text-secondary">Logo Size: {logoSize}px</label>
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">Safe Recovery</span>
                  </div>
                  <input 
                    type="range" 
                    min="25" max="75" step="5" 
                    value={logoSize} 
                    onChange={(e) => setLogoSize(Number(e.target.value))}
                    className="w-full accent-accent cursor-pointer"
                  />
                  <p className="text-[10px] text-text-muted">
                    QR error correction is automatically set to Level H (30%) to safeguard code readability.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* TAB 6: SETTINGS & QUIET ZONE */}
          {activeSidebarTab === 'settings' && (
            <div className="space-y-4">
              <h3 className="font-black text-[10px] uppercase tracking-widest flex items-center gap-2 text-text-muted">
                <Sliders className="w-4 h-4 text-accent" /> Scan Engine & Quiet Zone
              </h3>

              {/* Error correction level */}
              <div className="fg">
                <div className="flex justify-between items-center mb-2">
                  <label className="text-xs font-bold text-text-secondary flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-accent" />
                    Error Correction Level
                  </label>
                  <span className="text-[10px] text-text-muted font-bold">
                    {level === 'M' && '⚡ Fastest Scanning (15%)'}
                    {level === 'L' && 'Lightest Density (7%)'}
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
                      className={`flex-1 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                        level === l 
                          ? 'bg-accent text-white border-accent shadow-xs' 
                          : 'border-border hover:bg-bg-secondary text-text-secondary'
                      }`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>

              {/* Quiet Zone Margin */}
              <div className="p-3 bg-bg-secondary/40 rounded-xl border border-border space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-text-secondary block">Quiet Zone (Margin)</span>
                    <span className="text-[10px] text-text-muted">Surrounding boundary for scanner cameras</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIncludeMargin(!includeMargin)}
                    className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer ${includeMargin ? 'bg-accent' : 'bg-border'}`}
                  >
                    <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${includeMargin ? 'translate-x-5' : ''}`} />
                  </button>
                </div>

                {includeMargin && (
                  <div className="flex items-center gap-1.5 pt-1">
                    {[
                      { label: 'Standard (4)', val: 4 },
                      { label: 'Compact (2)', val: 2 },
                      { label: 'Wide (6)', val: 6 },
                    ].map((m) => (
                      <button
                        key={m.val}
                        type="button"
                        onClick={() => setMarginSize(m.val)}
                        className={`flex-1 py-1 px-2 rounded-lg border text-[10px] font-bold transition-all cursor-pointer ${
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
          )}
        </div>

        {/* Sidebar Bottom Actions (Download & Print) */}
        <div className="sidebar-actions p-4 border-t border-border bg-surface flex flex-col gap-2">
          <div className="flex gap-2">
            {(["png", "svg", "jpeg"] as const).map((fmt) => (
              <button 
                key={fmt}
                onClick={() => setDownloadFormat(fmt)} 
                className={`flex-1 py-1.5 rounded-xl border font-bold text-xs uppercase transition-all cursor-pointer ${
                  downloadFormat === fmt ? "bg-accent text-white border-accent shadow-xs" : "border-border hover:bg-bg-secondary text-text-secondary"
                }`}
              >
                {fmt}
              </button>
            ))}
          </div>
          <button 
            onClick={handleDownloadQr} 
            className="btn bp gap-2 w-full py-3 text-xs font-black uppercase tracking-widest shadow-lg shadow-accent/20 cursor-pointer"
          >
            <Download className="w-4 h-4" /> Download QR Code ({downloadFormat.toUpperCase()})
          </button>
          <button
            type="button"
            onClick={handleOpenPrintSheet}
            className="btn bg-accent/10 hover:bg-accent/20 text-accent border border-accent/30 gap-2 w-full py-2.5 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center"
          >
            <Printer className="w-4 h-4" /> Print Multiple Copies / Sheet
          </button>
        </div>
      </aside>

      {/* Right Main Preview Area */}
      <main className="tool-main-preview">
        <div className="preview-content-wrapper p-3 sm:p-5 lg:p-6 flex flex-col gap-4">
          
          {/* Top Dedicated Toolbar (Positioned naturally in flow - NEVER overlaps QR Code or frame text) */}
          <div className="w-full bg-surface p-3 sm:p-3.5 rounded-2xl border border-border shadow-xs flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-3 py-1 rounded-full bg-bg-secondary border border-border text-xs font-bold text-text-primary shadow-2xs flex items-center gap-1.5">
                <QrCode className="w-3.5 h-3.5 text-accent" />
                <span>QR Code Preview</span>
              </span>
              {isEncrypted && (
                <span className="px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold text-[10px] border border-amber-500/20 flex items-center gap-1">
                  <Lock className="w-3 h-3" /> Password Protected (AES-256)
                </span>
              )}
              {frameStyle !== 'none' && (
                <span className="px-2.5 py-1 rounded-full bg-accent/10 text-accent font-bold text-[10px] border border-accent/20">
                  Frame: {FRAME_OPTIONS.find(f => f.id === frameStyle)?.name}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
              <button
                type="button"
                onClick={handleCopyImage}
                className="px-3 py-1.5 rounded-xl bg-surface hover:bg-bg-secondary border border-border text-text-primary font-bold text-xs shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer hover:border-accent"
                title="Copy high-res image to clipboard"
              >
                <Copy className="w-3.5 h-3.5 text-accent" />
                <span>Copy</span>
              </button>

              <button
                type="button"
                onClick={handleOpenPrintSheet}
                className="px-3 py-1.5 rounded-xl bg-surface hover:bg-bg-secondary border border-border text-text-primary font-bold text-xs shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer hover:border-accent"
                title="Print multiple copies on A4, Letter, Stickers, etc."
              >
                <Printer className="w-3.5 h-3.5 text-accent" />
                <span>Print Copies</span>
              </button>

              <button
                type="button"
                onClick={handleOptimizeFastScan}
                className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-black text-xs uppercase tracking-wider shadow-2xs transition-all flex items-center gap-1 cursor-pointer active:scale-95"
              >
                <Zap className="w-3.5 h-3.5" /> Ultra-Fast Scan
              </button>
            </div>
          </div>

          {/* Central Preview Showcase Card */}
          <div className="flex-1 w-full flex flex-col items-center justify-center p-4 sm:p-8 bg-bg-secondary/40 rounded-3xl border border-border shadow-inner min-h-[460px] overflow-auto custom-scrollbar">
            
            {/* LIVE PREVIEW CONTAINER: FRAMED OR CLEAN */}
            <div className="flex items-center justify-center p-2 sm:p-4 w-full max-w-full">
              {/* FRAME WRAPPER */}
              <div 
                className={`transition-all duration-300 relative max-w-full ${
                  frameStyle === 'none' 
                    ? 'p-4 sm:p-5 rounded-2xl bg-surface border border-border shadow-md' 
                    : frameStyle === 'header-banner'
                    ? 'rounded-3xl bg-surface border border-border shadow-xl overflow-hidden flex flex-col items-center max-w-[94vw]'
                    : frameStyle === 'bottom-tag'
                    ? 'rounded-3xl bg-surface border border-border shadow-xl p-5 sm:p-6 flex flex-col items-center gap-4 max-w-[94vw]'
                    : frameStyle === 'polaroid'
                    ? 'rounded-2xl bg-surface border border-border shadow-2xl p-6 pb-4 flex flex-col items-center max-w-[94vw]'
                    : frameStyle === 'countertop'
                    ? 'rounded-3xl bg-surface border-2 border-border shadow-2xl overflow-hidden flex flex-col items-center max-w-[94vw]'
                    : frameStyle === 'coupon'
                    ? 'rounded-2xl bg-surface border-2 border-dashed shadow-lg p-5 sm:p-6 flex flex-col items-center gap-3 max-w-[94vw]'
                    : frameStyle === 'smartphone'
                    ? 'rounded-[38px] bg-slate-900 border-[8px] border-slate-800 shadow-2xl p-4 pt-6 pb-6 flex flex-col items-center max-w-[94vw]'
                    : 'rounded-full bg-surface border-8 shadow-2xl p-6 sm:p-8 flex flex-col items-center justify-center max-w-[94vw]'
                }`}
                style={{
                  borderColor: frameStyle === 'coupon' ? effectiveFrameColor : frameStyle === 'circular-seal' ? effectiveFrameColor : undefined
                }}
              >
                {/* Header Banner Frame Header */}
                {frameStyle === 'header-banner' && (
                  <div 
                    className="w-full py-3 sm:py-3.5 px-4 sm:px-6 flex items-center justify-center gap-2 font-black text-xs sm:text-sm uppercase tracking-wider transition-colors shadow-xs"
                    style={{ backgroundColor: effectiveFrameColor, color: frameTextColor }}
                  >
                    <QrCode className="w-4 h-4 shrink-0" />
                    <span className="truncate">{frameText || 'SCAN ME'}</span>
                  </div>
                )}

                {/* Countertop Stand Header */}
                {frameStyle === 'countertop' && (
                  <div 
                    className="w-full py-3 sm:py-3.5 px-4 sm:px-6 flex items-center justify-center gap-2 font-black text-xs sm:text-sm uppercase tracking-wider transition-colors shadow-xs"
                    style={{ backgroundColor: effectiveFrameColor, color: frameTextColor }}
                  >
                    <CreditCard className="w-4 h-4 shrink-0" />
                    <span className="truncate">{frameText || 'SCAN & PAY HERE'}</span>
                  </div>
                )}

                {/* Coupon Top Notch */}
                {frameStyle === 'coupon' && (
                  <div 
                    className="px-4 py-1 rounded-full text-xs font-black uppercase tracking-wider shadow-xs"
                    style={{ backgroundColor: effectiveFrameColor, color: frameTextColor }}
                  >
                    ★ {frameText || 'SPECIAL OFFER'} ★
                  </div>
                )}

                {/* Smartphone Speaker Pill & Top Title */}
                {frameStyle === 'smartphone' && (
                  <div className="w-full flex flex-col items-center mb-2 px-2">
                    <div className="w-14 sm:w-16 h-1.5 bg-slate-700 rounded-full mb-2" />
                    <span className="text-[11px] font-black text-slate-300 tracking-wider uppercase truncate">
                      {frameText || 'DIGITAL PASS'}
                    </span>
                  </div>
                )}

                {/* Circular Seal Top Badge */}
                {frameStyle === 'circular-seal' && (
                  <div className="w-full flex flex-col items-center mb-2">
                    <span 
                      className="px-3.5 py-1 rounded-full text-[10px] sm:text-[11px] font-black uppercase tracking-wider shadow-xs"
                      style={{ backgroundColor: effectiveFrameColor, color: frameTextColor }}
                    >
                      ★ {frameText || 'VERIFIED QR'} ★
                    </span>
                  </div>
                )}

                {/* QR CODE INNER CONTAINER (Responsive scaling on all screens) */}
                <div 
                  className={`relative flex items-center justify-center overflow-hidden transition-all max-w-full ${
                    frameStyle === 'header-banner' ? 'p-4 sm:p-6 pb-2' : ''
                  }`}
                  style={{
                    backgroundColor: isTransparentBg ? 'transparent' : bgColor,
                    backgroundImage: isTransparentBg ? 'repeating-conic-gradient(#cbd5e1 0% 25%, transparent 0% 50%) 50% / 14px 14px' : 'none',
                    borderRadius: qrShape === 'circle' ? '9999px' : '16px'
                  }}
                >
                  <div 
                    ref={qrContainerRef} 
                    className="flex items-center justify-center [&_canvas]:max-w-full [&_canvas]:h-auto [&_svg]:max-w-full [&_svg]:h-auto" 
                  />
                </div>

                {/* Header Banner Subtext */}
                {frameStyle === 'header-banner' && frameSubtext && (
                  <div className="pb-4 pt-1.5 text-xs font-semibold text-text-muted text-center px-4 max-w-full truncate">
                    {frameSubtext}
                  </div>
                )}

                {/* Bottom Tag Pill */}
                {frameStyle === 'bottom-tag' && (
                  <div 
                    className="px-6 py-2 rounded-full font-black text-xs uppercase tracking-wider shadow-md transition-all flex items-center gap-1.5 max-w-full"
                    style={{ backgroundColor: effectiveFrameColor, color: frameTextColor }}
                  >
                    <Sparkles className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{frameText || 'SCAN ME'}</span>
                  </div>
                )}

                {/* Polaroid Bottom Caption */}
                {frameStyle === 'polaroid' && (
                  <div className="w-full text-center pt-3 pb-1 px-2">
                    <h4 className="text-sm font-black text-text-primary tracking-tight truncate">
                      {frameText || 'Scan To Connect'}
                    </h4>
                    {frameSubtext && (
                      <p className="text-[11px] text-text-muted font-medium mt-0.5 truncate">
                        {frameSubtext}
                      </p>
                    )}
                  </div>
                )}

                {/* Countertop Stand Footer */}
                {frameStyle === 'countertop' && (
                  <div className="w-full py-2 bg-bg-secondary border-t border-border flex items-center justify-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-bold text-xs px-2">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{frameSubtext || 'Instant & Verified Payment'}</span>
                  </div>
                )}

                {/* Coupon Bottom Subtext */}
                {frameStyle === 'coupon' && frameSubtext && (
                  <div className="text-[11px] font-bold text-text-muted text-center max-w-full truncate">
                    {frameSubtext}
                  </div>
                )}

                {/* Circular Seal Subtext */}
                {frameStyle === 'circular-seal' && frameSubtext && (
                  <div className="mt-2 text-[10px] font-bold text-text-muted uppercase tracking-wider text-center max-w-full truncate">
                    {frameSubtext}
                  </div>
                )}

                {/* Smartphone Home Bar */}
                {frameStyle === 'smartphone' && (
                  <div className="w-20 h-1 bg-slate-600 rounded-full mt-3" />
                )}
              </div>
            </div>

            {/* Diagnostics Bar */}
            <div className="flex flex-wrap items-center justify-center gap-2 mt-4 text-xs">
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface border border-border shadow-2xs font-mono text-[11px]">
                <span className="w-2.5 h-2.5 rounded-full border border-black/20" style={{ backgroundColor: fgColor }} />
                <span>FG: {fgColor.toUpperCase()}</span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface border border-border shadow-2xs font-mono text-[11px]">
                <span className="w-2.5 h-2.5 rounded-full border border-black/20" style={{ backgroundColor: isTransparentBg ? "transparent" : bgColor }} />
                <span>BG: {isTransparentBg ? "TRANSPARENT" : bgColor.toUpperCase()}</span>
              </div>
              <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-bold text-[10px] border border-emerald-500/20">
                Pattern: {dotsType}
              </span>
              <span className="px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-300 font-bold text-[10px] border border-blue-500/20">
                Recovery: Level {level}
              </span>
            </div>

            {/* Slider Control: QR Size */}
            <div className="mt-4 w-full max-w-md bg-surface p-3.5 rounded-xl border border-border shadow-xs">
              <div className="flex justify-between items-center mb-1">
                <label className="text-xs font-bold text-text-secondary">QR Code Size: {size}px</label>
                <span className="text-[10px] text-text-muted">High-DPI Matrix</span>
              </div>
              <input 
                type="range" 
                min="180" max="450" step="10" 
                value={size} 
                onChange={(e) => setSize(Number(e.target.value))}
                className="w-full accent-accent cursor-pointer"
              />
            </div>

            {/* Encoded Payload Inspector with Copy & Test Decrypt */}
            <div className="mt-3 w-full max-w-md bg-surface p-3 rounded-xl border border-border shadow-2xs">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3 text-emerald-500" />
                    {isEncrypted ? "Encrypted Payload (AES-256)" : "Live Encoded Payload"}
                  </span>
                  {isEncrypted && (
                    <span className="px-1.5 py-0.2 rounded text-[9px] font-black uppercase bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                      Locked
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {isEncrypted && (
                    <button
                      type="button"
                      onClick={handleOpenTestUnlock}
                      className="text-[10px] font-bold text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <Unlock className="w-3 h-3" /> Test Unlock
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleCopyPayload}
                    className="text-[10px] font-bold text-accent hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    {copiedPayload ? <CheckCheck className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                    {copiedPayload ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>
              <div className="p-2 rounded-lg bg-bg-secondary text-[11px] font-mono text-text-secondary break-all max-h-16 overflow-y-auto custom-scrollbar">
                {isEncrypted
                  ? (encryptedPayload || (qrPassword ? "Encrypting..." : "⚠️ Enter password in Security tab to generate encrypted QR"))
                  : (value || "<Empty>")}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Multiple Copies / Multi-Paper Size Sheet Printing Modal */}
      <PrintSheetModal
        isOpen={printModalOpen}
        onClose={() => setPrintModalOpen(false)}
        title="Designed QR Code Print Sheet"
        itemImageSrc={printModalItemImage}
        itemType="qr"
        initialQrValue={isEncrypted && encryptedPayload ? encryptedPayload : value}
      />

      {/* Decryption / Unlock Modal (For recipients scanning or live testing) */}
      {unlockModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-surface border border-border rounded-3xl max-w-md w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-border bg-bg-secondary/40 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20 flex items-center justify-center">
                  <Lock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-text-primary">Unlock Protected QR Code</h3>
                  <p className="text-[11px] text-text-muted">Enter secret password to decrypt contents</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setUnlockModalOpen(false);
                  setUnlockError('');
                  setDecryptedResult(null);
                }}
                className="w-8 h-8 rounded-full bg-surface hover:bg-bg-secondary border border-border flex items-center justify-center text-text-muted hover:text-text-primary transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-5 space-y-4 overflow-y-auto custom-scrollbar">
              {/* Optional Password Hint */}
              {unlockHintText && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-start gap-2.5">
                  <span className="text-base">💡</span>
                  <div>
                    <div className="text-[11px] font-bold text-amber-600 dark:text-amber-400">Password Hint:</div>
                    <div className="text-xs text-text-primary font-medium mt-0.5">{unlockHintText}</div>
                  </div>
                </div>
              )}

              {/* Password Input View */}
              {!decryptedResult && (
                <div className="space-y-3">
                  <div className="fg">
                    <label className="fl flex items-center gap-1.5">
                      <Key className="w-3.5 h-3.5 text-accent" /> Secret Password
                    </label>
                    <div className="relative">
                      <input
                        type={showUnlockPassword ? 'text' : 'password'}
                        value={unlockPasswordInput}
                        onChange={(e) => {
                          setUnlockPasswordInput(e.target.value);
                          if (unlockError) setUnlockError('');
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handlePerformUnlock();
                          }
                        }}
                        placeholder="Enter password..."
                        className="fi pr-10 text-xs font-mono"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => setShowUnlockPassword(!showUnlockPassword)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary cursor-pointer p-1"
                      >
                        {showUnlockPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {unlockError && (
                    <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/25 flex items-center gap-2 text-xs text-red-600 dark:text-red-400 font-bold">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{unlockError}</span>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => handlePerformUnlock()}
                    disabled={isDecryptingQr || !unlockPasswordInput.trim()}
                    className="btn bp w-full py-2.5 text-xs font-bold gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {isDecryptingQr ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Decrypting...
                      </>
                    ) : (
                      <>
                        <Unlock className="w-3.5 h-3.5" /> Decrypt & View
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Decrypted Result View */}
              {decryptedResult && (
                <div className="space-y-3 animate-in fade-in zoom-in-95 duration-200">
                  <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center gap-2 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>Successfully Decrypted (AES-256-GCM)</span>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-bg-secondary border border-border">
                    <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider block mb-1">
                      Decrypted Content:
                    </span>
                    <div className="text-xs font-mono text-text-primary break-all max-h-40 overflow-y-auto custom-scrollbar select-all">
                      {decryptedResult}
                    </div>
                  </div>

                  {/* Actions for decrypted content */}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(decryptedResult);
                        setCopiedDecrypted(true);
                        setTimeout(() => setCopiedDecrypted(false), 2000);
                      }}
                      className="btn bs flex-1 py-2 text-xs font-bold gap-1.5 cursor-pointer"
                    >
                      {copiedDecrypted ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5 text-accent" />}
                      <span>{copiedDecrypted ? 'Copied!' : 'Copy Content'}</span>
                    </button>

                    {(decryptedResult.startsWith('http://') || decryptedResult.startsWith('https://')) && (
                      <button
                        type="button"
                        onClick={() => {
                          const target = decryptedResult.startsWith('http') ? decryptedResult : `https://${decryptedResult}`;
                          window.open(target, '_blank', 'noopener,noreferrer');
                        }}
                        className="btn bp flex-1 py-2 text-xs font-bold gap-1.5 cursor-pointer"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Open Link</span>
                      </button>
                    )}
                  </div>

                  <div className="pt-2 border-t border-border flex justify-center">
                    <button
                      type="button"
                      onClick={() => {
                        setDecryptedResult(null);
                        setUnlockPasswordInput('');
                        setUnlockError('');
                      }}
                      className="text-xs font-bold text-text-muted hover:text-text-primary underline cursor-pointer"
                    >
                      Lock again / Enter another password
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
