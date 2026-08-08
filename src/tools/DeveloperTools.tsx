import { useState, useEffect } from 'react';
import { Copy, Trash2, Check, Code, Smartphone, Monitor, Tablet } from 'lucide-react';

// Simple MD5 implementation for client-side hashing
function md5(inputString: string): string {
  function safeAdd(x: number, y: number): number {
    const lsw = (x & 0xffff) + (y & 0xffff);
    const msw = (x >> 16) + (y >> 16) + (lsw >> 16);
    return (msw << 16) | (lsw & 0xffff);
  }
  function bitRol(num: number, cnt: number): number {
    return (num << cnt) | (num >>> (32 - cnt));
  }
  function md5cmn(q: number, a: number, b: number, x: number, s: number, t: number): number {
    return safeAdd(bitRol(safeAdd(safeAdd(a, q), safeAdd(x, t)), s), b);
  }
  function md5ff(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number {
    return md5cmn((b & c) | (~b & d), a, b, x, s, t);
  }
  function md5gg(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number {
    return md5cmn((b & d) | (c & ~d), a, b, x, s, t);
  }
  function md5hh(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number {
    return md5cmn(b ^ c ^ d, a, b, x, s, t);
  }
  function md5ii(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number {
    return md5cmn(c ^ (b | ~d), a, b, x, s, t);
  }

  function binlMD5(x: number[], len: number): number[] {
    x[len >> 5] |= 0x80 << (len % 32);
    x[(((len + 64) >>> 9) << 4) + 14] = len;

    let a = 1732584193;
    let b = -271733879;
    let c = -1732584194;
    let d = 271733878;

    for (let i = 0; i < x.length; i += 16) {
      const olda = a;
      const oldb = b;
      const oldc = c;
      const oldd = d;

      a = md5ff(a, b, c, d, x[i], 7, -680876936);
      d = md5ff(d, a, b, c, x[i + 1], 12, -389564586);
      c = md5ff(c, d, a, b, x[i + 2], 17, 606105819);
      b = md5ff(b, c, d, a, x[i + 3], 22, -1044525330);
      a = md5ff(a, b, c, d, x[i + 4], 7, -176418897);
      d = md5ff(d, a, b, c, x[i + 5], 12, 1200080426);
      c = md5ff(c, d, a, b, x[i + 6], 17, -1473231341);
      b = md5ff(b, c, d, a, x[i + 7], 22, -45705983);
      a = md5ff(a, b, c, d, x[i + 8], 7, 1770035416);
      d = md5ff(d, a, b, c, x[i + 9], 12, -1958414417);
      c = md5ff(c, d, a, b, x[i + 10], 17, -42063);
      b = md5ff(b, c, d, a, x[i + 11], 22, -1990404162);
      a = md5ff(a, b, c, d, x[i + 12], 7, 1804603682);
      d = md5ff(d, a, b, c, x[i + 13], 12, -40341101);
      c = md5ff(c, d, a, b, x[i + 14], 17, -1502002290);
      b = md5ff(b, c, d, a, x[i + 15], 22, 1236535329);

      a = md5gg(a, b, c, d, x[i + 1], 5, -165796510);
      d = md5gg(d, a, b, c, x[i + 6], 9, -1069501632);
      c = md5gg(c, d, a, b, x[i + 11], 14, 643717713);
      b = md5gg(b, c, d, a, x[i], 20, -373897302);
      a = md5gg(a, b, c, d, x[i + 5], 5, -701558691);
      d = md5gg(d, a, b, c, x[i + 10], 9, 38016083);
      c = md5gg(c, d, a, b, x[i + 15], 14, -660478335);
      b = md5gg(b, c, d, a, x[i + 4], 20, -405537848);
      a = md5gg(a, b, c, d, x[i + 9], 5, 568446438);
      d = md5gg(d, a, b, c, x[i + 14], 9, -1019803690);
      c = md5gg(c, d, a, b, x[i + 3], 14, -187363961);
      b = md5gg(b, c, d, a, x[i + 8], 20, 1163531501);
      a = md5gg(a, b, c, d, x[i + 13], 5, -1444681467);
      d = md5gg(d, a, b, c, x[i + 2], 9, -51403784);
      c = md5gg(c, d, a, b, x[i + 7], 14, 1735328473);
      b = md5gg(b, c, d, a, x[i + 12], 20, -1926607734);

      a = md5hh(a, b, c, d, x[i + 5], 4, -378558);
      d = md5hh(d, a, b, c, x[i + 8], 11, -2022574463);
      c = md5hh(c, d, a, b, x[i + 11], 16, 1839030562);
      b = md5hh(b, c, d, a, x[i + 14], 23, -35309556);
      a = md5hh(a, b, c, d, x[i + 1], 4, -1530992060);
      d = md5hh(d, a, b, c, x[i + 4], 11, 1272893353);
      c = md5hh(c, d, a, b, x[i + 7], 16, -155497632);
      b = md5hh(b, c, d, a, x[i + 10], 23, -1094730640);
      a = md5hh(a, b, c, d, x[i + 13], 4, 681279174);
      d = md5hh(d, a, b, c, x[i], 11, -358537222);
      c = md5hh(c, d, a, b, x[i + 3], 16, -722521979);
      b = md5hh(b, c, d, a, x[i + 6], 23, 76029189);
      a = md5hh(a, b, c, d, x[i + 9], 4, -640364487);
      d = md5hh(d, a, b, c, x[i + 12], 11, -421815835);
      c = md5hh(c, d, a, b, x[i + 15], 16, 530742520);
      b = md5hh(b, c, d, a, x[i + 2], 23, -995338651);

      a = md5ii(a, b, c, d, x[i], 6, -198630844);
      d = md5ii(d, a, b, c, x[i + 7], 10, 1126891415);
      c = md5ii(c, d, a, b, x[i + 14], 15, -1416354905);
      b = md5ii(b, c, d, a, x[i + 5], 21, -57434055);
      a = md5ii(a, b, c, d, x[i + 12], 6, 1700485571);
      d = md5ii(d, a, b, c, x[i + 3], 10, -1894986606);
      c = md5ii(c, d, a, b, x[i + 10], 15, -1051523);
      b = md5ii(b, c, d, a, x[i + 1], 21, -2054922799);
      a = md5ii(a, b, c, d, x[i + 8], 6, 1873313359);
      d = md5ii(d, a, b, c, x[i + 15], 10, -30611744);
      c = md5ii(c, d, a, b, x[i + 6], 15, -1560198380);
      b = md5ii(b, c, d, a, x[i + 13], 21, 1309151649);
      a = md5ii(a, b, c, d, x[i + 4], 6, -145523070);
      d = md5ii(d, a, b, c, x[i + 11], 10, -1120210379);
      c = md5ii(c, d, a, b, x[i + 2], 15, 718787259);
      b = md5ii(b, c, d, a, x[i + 9], 21, -343485551);

      a = safeAdd(a, olda);
      b = safeAdd(b, oldb);
      c = safeAdd(c, oldc);
      d = safeAdd(d, oldd);
    }
    return [a, b, c, d];
  }

  function rstr2binl(input: string): number[] {
    const output: number[] = Array(input.length >> 2).fill(0);
    for (let i = 0; i < input.length * 8; i += 8) {
      output[i >> 5] |= (input.charCodeAt(i / 8) & 0xff) << (i % 32);
    }
    return output;
  }

  function binl2rstr(input: number[]): string {
    let output = '';
    for (let i = 0; i < input.length * 32; i += 8) {
      output += String.fromCharCode((input[i >> 5] >>> (i % 32)) & 0xff);
    }
    return output;
  }

  function rstr2hex(input: string): string {
    const hexTab = '0123456789abcdef';
    let output = '';
    for (let i = 0; i < input.length; i++) {
      const x = input.charCodeAt(i);
      output += hexTab.charAt((x >>> 4) & 0x0f) + hexTab.charAt(x & 0x0f);
    }
    return output;
  }

  const utf8 = unescape(encodeURIComponent(inputString));
  return rstr2hex(binl2rstr(binlMD5(rstr2binl(utf8), utf8.length * 8)));
}

export default function DeveloperTools({ toolId }: { toolId: string }) {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [copied, setCopied] = useState<string | boolean>(false);

  // UUID Options
  const [uuidCount, setUuidCount] = useState(1);
  const [uuidHyphens, setUuidHyphens] = useState(true);
  const [uuidUppercase, setUuidUppercase] = useState(false);
  const [uuidBraces, setUuidBraces] = useState(false);

  // Color Converter State
  const [hexColor, setHexColor] = useState('#e8501a');
  const [colorValues, setColorValues] = useState<{
    hex: string;
    rgb: string;
    hsl: string;
    hsv: string;
    cmyk: string;
  }>({
    hex: '#e8501a',
    rgb: 'rgb(232, 80, 26)',
    hsl: 'hsl(16, 82%, 51%)',
    hsv: 'hsv(16, 89%, 91%)',
    cmyk: 'cmyk(0%, 66%, 89%, 9%)'
  });

  // Regex Tester State
  const [regexPattern, setRegexPattern] = useState('[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}');
  const [regexFlags, setRegexFlags] = useState({ g: true, i: true, m: false, s: false });
  const [regexText, setRegexText] = useState('Contact us at support@loveyoutools.in or feedback@example.com for inquiries.');
  const [regexMatches, setRegexMatches] = useState<any[]>([]);
  const [regexError, setRegexError] = useState<string | null>(null);

  // Hash Generator State
  const [hashes, setHashes] = useState<{ [key: string]: string }>({});

  // Minifier State
  const [minifyType, setMinifyType] = useState<'html' | 'css' | 'js'>('html');
  const [minifyStats, setMinifyStats] = useState<{ orig: number; min: number; saved: number } | null>(null);

  // HTML Live Preview State
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [htmlCode, setHtmlCode] = useState(`<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: system-ui, sans-serif; padding: 2rem; background: #f8fafc; color: #1e293b; }
    .card { background: white; border-radius: 12px; padding: 1.5rem; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); max-width: 400px; margin: auto; }
    h2 { color: #e8501a; margin-top: 0; }
    button { background: #e8501a; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: bold; }
    button:hover { opacity: 0.9; }
  </style>
</head>
<body>
  <div class="card">
    <h2>LoveYouTools Live Preview</h2>
    <p>Edit HTML, CSS, and JavaScript in real-time right here in your browser.</p>
    <button onclick="alert('Hello from Live Preview!')">Click Me</button>
  </div>
</body>
</html>`);

  useEffect(() => {
    setInput('');
    setOutput('');
    setCopied(false);
  }, [toolId]);

  // Color Converter calculation
  const updateColorsFromHex = (hex: string) => {
    let cleanHex = hex.trim();
    if (!cleanHex.startsWith('#')) cleanHex = '#' + cleanHex;
    setHexColor(cleanHex);

    const validHex = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(cleanHex);
    if (!validHex) return;

    const r = parseInt(validHex[1], 16);
    const g = parseInt(validHex[2], 16);
    const b = parseInt(validHex[3], 16);

    // RGB
    const rgbStr = `rgb(${r}, ${g}, ${b})`;

    // HSL
    const rNorm = r / 255;
    const gNorm = g / 255;
    const bNorm = b / 255;
    const max = Math.max(rNorm, gNorm, bNorm);
    const min = Math.min(rNorm, gNorm, bNorm);
    let h = 0, s = 0, l = (max + min) / 2;

    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case rNorm: h = (gNorm - bNorm) / d + (gNorm < bNorm ? 6 : 0); break;
        case gNorm: h = (bNorm - rNorm) / d + 2; break;
        case bNorm: h = (rNorm - gNorm) / d + 4; break;
      }
      h /= 6;
    }
    const hslStr = `hsl(${Math.round(h * 360)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`;

    // HSV
    const v = max;
    const sHsv = max === 0 ? 0 : (max - min) / max;
    const hsvStr = `hsv(${Math.round(h * 360)}, ${Math.round(sHsv * 100)}%, ${Math.round(v * 100)}%)`;

    // CMYK
    const k = 1 - max;
    const c = (1 - rNorm - k) / (1 - k) || 0;
    const m = (1 - gNorm - k) / (1 - k) || 0;
    const y = (1 - bNorm - k) / (1 - k) || 0;
    const cmykStr = `cmyk(${Math.round(c * 100)}%, ${Math.round(m * 100)}%, ${Math.round(y * 100)}%, ${Math.round(k * 100)}%)`;

    setColorValues({
      hex: cleanHex.toUpperCase(),
      rgb: rgbStr,
      hsl: hslStr,
      hsv: hsvStr,
      cmyk: cmykStr
    });
  };

  // Generate Hashes
  const generateHashes = async (text: string) => {
    if (!text) {
      setHashes({});
      return;
    }
    const encoder = new TextEncoder();
    const data = encoder.encode(text);

    try {
      const sha1Buffer = await crypto.subtle.digest('SHA-1', data);
      const sha256Buffer = await crypto.subtle.digest('SHA-256', data);
      const sha384Buffer = await crypto.subtle.digest('SHA-384', data);
      const sha512Buffer = await crypto.subtle.digest('SHA-512', data);

      const bufToHex = (buf: ArrayBuffer) =>
        Array.from(new Uint8Array(buf))
          .map(b => b.toString(16).padStart(2, '0'))
          .join('');

      setHashes({
        MD5: md5(text),
        'SHA-1': bufToHex(sha1Buffer),
        'SHA-256': bufToHex(sha256Buffer),
        'SHA-384': bufToHex(sha384Buffer),
        'SHA-512': bufToHex(sha512Buffer)
      });
    } catch (e) {
      setHashes({ MD5: md5(text) });
    }
  };

  // Generate UUIDs
  const generateUuids = () => {
    const list: string[] = [];
    for (let i = 0; i < uuidCount; i++) {
      let id = crypto.randomUUID();
      if (!uuidHyphens) id = id.replace(/-/g, '');
      if (uuidUppercase) id = id.toUpperCase();
      if (uuidBraces) id = `{${id}}`;
      list.push(id);
    }
    setOutput(list.join('\n'));
  };

  // Run Regex Test
  useEffect(() => {
    if (toolId !== 'regex-tester') return;
    try {
      setRegexError(null);
      let flags = '';
      if (regexFlags.g) flags += 'g';
      if (regexFlags.i) flags += 'i';
      if (regexFlags.m) flags += 'm';
      if (regexFlags.s) flags += 's';

      const re = new RegExp(regexPattern, flags);
      const matches: any[] = [];

      if (flags.includes('g')) {
        let match;
        while ((match = re.exec(regexText)) !== null) {
          matches.push({
            match: match[0],
            index: match.index,
            groups: match.slice(1)
          });
          if (match.index === re.lastIndex) re.lastIndex++;
        }
      } else {
        const match = re.exec(regexText);
        if (match) {
          matches.push({
            match: match[0],
            index: match.index,
            groups: match.slice(1)
          });
        }
      }
      setRegexMatches(matches);
    } catch (e: any) {
      setRegexError(e.message);
      setRegexMatches([]);
    }
  }, [regexPattern, regexFlags, regexText, toolId]);

  const handleCopyText = (text: string, label: string = 'main') => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(false), 2000);
  };

  // Minify Code
  const runMinifier = (action: 'minify' | 'beautify') => {
    if (!input.trim()) return;
    let res = '';
    const origSize = new Blob([input]).size;

    if (action === 'minify') {
      if (minifyType === 'html') {
        res = input
          .replace(/<!--[\s\S]*?-->/g, '')
          .replace(/\s+/g, ' ')
          .replace(/> </g, '><')
          .trim();
      } else if (minifyType === 'css') {
        res = input
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/\s+/g, ' ')
          .replace(/\s*([\{\}:;,])\s*/g, '$1')
          .replace(/;\}/g, '}')
          .trim();
      } else {
        // JS simple safe minifier
        res = input
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/\/\/.*/g, '')
          .replace(/\s+/g, ' ')
          .replace(/\s*([=+\-*/%&|!<>?:;,{}()])\s*/g, '$1')
          .trim();
      }
    } else {
      // Beautify
      if (minifyType === 'html') {
        let formatted = '';
        let indent = 0;
        input.split(/>\s*</).forEach(element => {
          if (element.match(/^\/\w/)) indent = Math.max(0, indent - 1);
          formatted += '  '.repeat(indent) + '<' + element + '>\n';
          if (element.match(/^<?\w[^>]*[^\/]$/) && !element.startsWith('input') && !element.startsWith('img') && !element.startsWith('br') && !element.startsWith('hr')) {
            indent++;
          }
        });
        res = formatted.trim();
      } else if (minifyType === 'css') {
        res = input
          .replace(/\s*\{\s*/g, ' {\n  ')
          .replace(/\s*;\s*/g, ';\n  ')
          .replace(/\s*\}\s*/g, '\n}\n\n')
          .trim();
      } else {
        res = input;
      }
    }

    const minSize = new Blob([res]).size;
    const saved = Math.max(0, origSize - minSize);
    setMinifyStats({ orig: origSize, min: minSize, saved });
    setOutput(res);
  };

  // Process Base64 & URL Encode/Decode
  const processEncoding = (type: 'b64-enc' | 'b64-dec' | 'url-enc' | 'url-dec' | 'url-comp-enc' | 'url-comp-dec') => {
    let res = '';
    try {
      if (type === 'b64-enc') {
        res = btoa(unescape(encodeURIComponent(input)));
      } else if (type === 'b64-dec') {
        res = decodeURIComponent(escape(atob(input.trim())));
      } else if (type === 'url-enc') {
        res = encodeURI(input);
      } else if (type === 'url-dec') {
        res = decodeURI(input);
      } else if (type === 'url-comp-enc') {
        res = encodeURIComponent(input);
      } else if (type === 'url-comp-dec') {
        res = decodeURIComponent(input);
      }
    } catch (e: any) {
      res = `Error: ${e.message}`;
    }
    setOutput(res);
  };

  return (
    <div className="space-y-6">
      {/* 1. HTML LIVE PREVIEW */}
      {(toolId === 'html-live-preview' || toolId === 'html-preview') && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4 bg-surface border border-border p-4 rounded-xl">
            <div className="flex items-center gap-2">
              <Code className="w-5 h-5 text-accent" />
              <span className="font-bold text-sm">HTML / CSS / JS Live Editor</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPreviewDevice('desktop')}
                className={`p-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${previewDevice === 'desktop' ? 'bg-accent text-white' : 'bg-bg-secondary hover:bg-border'}`}
              >
                <Monitor className="w-4 h-4" /> Desktop
              </button>
              <button
                onClick={() => setPreviewDevice('tablet')}
                className={`p-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${previewDevice === 'tablet' ? 'bg-accent text-white' : 'bg-bg-secondary hover:bg-border'}`}
              >
                <Tablet className="w-4 h-4" /> Tablet
              </button>
              <button
                onClick={() => setPreviewDevice('mobile')}
                className={`p-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${previewDevice === 'mobile' ? 'bg-accent text-white' : 'bg-bg-secondary hover:bg-border'}`}
              >
                <Smartphone className="w-4 h-4" /> Mobile
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="fg">
              <div className="flex items-center justify-between mb-2">
                <label className="fl">HTML & CSS Code</label>
                <button
                  onClick={() => setHtmlCode('')}
                  className="p-1.5 text-text-muted hover:text-red-500 hover:bg-red-500/10 rounded-md transition-colors"
                  title="Clear Code"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <textarea
                className="fta min-h-[480px] font-mono text-sm leading-relaxed"
                value={htmlCode}
                onChange={e => setHtmlCode(e.target.value)}
                placeholder="Enter HTML & CSS here..."
              />
            </div>

            <div className="fg flex flex-col">
              <label className="fl mb-2">Live Sandboxed Preview</label>
              <div className="flex-1 bg-neutral-900 border border-border rounded-xl p-3 flex justify-center items-center overflow-auto min-h-[480px]">
                <div
                  className="bg-white rounded-lg overflow-hidden transition-all shadow-xl h-full w-full"
                  style={{
                    maxWidth: previewDevice === 'mobile' ? '375px' : previewDevice === 'tablet' ? '768px' : '100%',
                    minHeight: '450px'
                  }}
                >
                  <iframe
                    srcDoc={htmlCode}
                    className="w-full h-full min-h-[450px] border-0"
                    title="Live Preview"
                    sandbox="allow-scripts"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. REGEX TESTER */}
      {toolId === 'regex-tester' && (
        <div className="space-y-6">
          <div className="bg-surface border border-border p-6 rounded-2xl space-y-4 shadow-sm">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
              <div className="md:col-span-3 fg">
                <label className="fl">Regular Expression (Pattern)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted font-mono font-bold text-lg">/</span>
                  <input
                    type="text"
                    className="fi pl-8 pr-8 font-mono text-sm"
                    value={regexPattern}
                    onChange={e => setRegexPattern(e.target.value)}
                    placeholder="[a-z0-9]+"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted font-mono font-bold text-lg">/</span>
                </div>
              </div>

              <div className="fg">
                <label className="fl">Flags</label>
                <div className="flex gap-2">
                  {(['g', 'i', 'm', 's'] as const).map(flag => (
                    <button
                      key={flag}
                      type="button"
                      onClick={() => setRegexFlags({ ...regexFlags, [flag]: !regexFlags[flag] })}
                      className={`flex-1 py-2 rounded-lg font-mono text-xs font-bold transition-colors ${regexFlags[flag] ? 'bg-accent text-white' : 'bg-bg-secondary text-text-muted hover:bg-border'}`}
                    >
                      {flag}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {regexError && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 rounded-lg text-sm font-mono">
                {regexError}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="fg">
              <div className="flex items-center justify-between mb-2">
                <label className="fl">Test String</label>
                <span className="text-xs text-text-muted">{regexMatches.length} match(es) found</span>
              </div>
              <textarea
                className="fta min-h-[300px] font-mono text-sm leading-relaxed"
                value={regexText}
                onChange={e => setRegexText(e.target.value)}
                placeholder="Insert test text here..."
              />
            </div>

            <div className="fg">
              <div className="flex items-center justify-between mb-2">
                <label className="fl">Match Details & Capture Groups</label>
                <button
                  onClick={() => handleCopyText(JSON.stringify(regexMatches, null, 2), 'regex')}
                  disabled={regexMatches.length === 0}
                  className="text-xs text-accent font-semibold hover:underline disabled:opacity-50"
                >
                  {copied === 'regex' ? 'Copied Matches!' : 'Copy Matches JSON'}
                </button>
              </div>

              <div className="bg-bg-secondary border border-border rounded-xl p-4 min-h-[300px] max-h-[400px] overflow-y-auto font-mono text-xs space-y-3">
                {regexMatches.length === 0 ? (
                  <div className="text-text-muted text-center py-12">No matches found with the current pattern and test string.</div>
                ) : (
                  regexMatches.map((m, idx) => (
                    <div key={idx} className="bg-surface border border-border p-3 rounded-lg shadow-sm">
                      <div className="flex items-center justify-between text-accent font-bold mb-1">
                        <span>Match #{idx + 1}</span>
                        <span className="text-text-muted font-normal">Index: {m.index}</span>
                      </div>
                      <div className="text-text-primary font-semibold break-all bg-bg-secondary p-1.5 rounded">{m.match}</div>
                      {m.groups && m.groups.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-border space-y-1">
                          <span className="text-text-muted text-[11px] block">Capture Groups:</span>
                          {m.groups.map((g: string, gIdx: number) => (
                            <div key={gIdx} className="text-text-secondary pl-2">
                              Group {gIdx + 1}: <span className="font-semibold text-text-primary">{g || '(empty)'}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. COLOR CODE CONVERTER */}
      {(toolId === 'color-code-converter' || toolId === 'color-converter-online') && (
        <div className="space-y-6 max-w-4xl mx-auto">
          <div className="bg-surface border border-border p-6 rounded-2xl shadow-sm grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
            <div className="flex flex-col items-center gap-3">
              <div
                className="w-32 h-32 rounded-2xl border-4 border-white dark:border-zinc-800 shadow-lg transition-colors"
                style={{ backgroundColor: hexColor }}
              />
              <input
                type="color"
                value={hexColor.startsWith('#') && hexColor.length === 7 ? hexColor : '#e8501a'}
                onChange={e => updateColorsFromHex(e.target.value)}
                className="w-32 h-10 cursor-pointer rounded-lg border border-border bg-transparent"
              />
            </div>

            <div className="md:col-span-2 space-y-3">
              <div className="fg">
                <label className="fl">HEX Input</label>
                <input
                  type="text"
                  className="fi font-mono text-base font-bold"
                  value={hexColor}
                  onChange={e => updateColorsFromHex(e.target.value)}
                  placeholder="#E8501A"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                {[
                  { label: 'HEX', val: colorValues.hex },
                  { label: 'RGB', val: colorValues.rgb },
                  { label: 'HSL', val: colorValues.hsl },
                  { label: 'HSV', val: colorValues.hsv },
                  { label: 'CMYK', val: colorValues.cmyk }
                ].map(item => (
                  <div key={item.label} className="bg-bg-secondary border border-border p-3 rounded-xl flex items-center justify-between">
                    <div>
                      <div className="text-[11px] font-bold text-text-muted uppercase">{item.label}</div>
                      <div className="font-mono text-sm font-semibold text-text-primary">{item.val}</div>
                    </div>
                    <button
                      onClick={() => handleCopyText(item.val, item.label)}
                      className="p-2 text-text-muted hover:text-accent hover:bg-surface rounded-lg transition-colors"
                      title={`Copy ${item.label}`}
                    >
                      {copied === item.label ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. UUID GENERATOR */}
      {(toolId === 'uuid-generator' || toolId === 'uuid-generator-online') && (
        <div className="space-y-6 max-w-4xl mx-auto">
          <div className="bg-surface border border-border p-6 rounded-2xl shadow-sm space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              <div className="fg">
                <label className="fl">Quantity (1 - 50)</label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  className="fi"
                  value={uuidCount}
                  onChange={e => setUuidCount(Math.max(1, Math.min(50, parseInt(e.target.value) || 1)))}
                />
              </div>

              <div className="flex items-center gap-2 pt-6">
                <input
                  type="checkbox"
                  id="uuid-hyphens"
                  checked={uuidHyphens}
                  onChange={e => setUuidHyphens(e.target.checked)}
                  className="w-4 h-4 rounded text-accent"
                />
                <label htmlFor="uuid-hyphens" className="text-sm font-medium cursor-pointer">Include Hyphens</label>
              </div>

              <div className="flex items-center gap-2 pt-6">
                <input
                  type="checkbox"
                  id="uuid-upper"
                  checked={uuidUppercase}
                  onChange={e => setUuidUppercase(e.target.checked)}
                  className="w-4 h-4 rounded text-accent"
                />
                <label htmlFor="uuid-upper" className="text-sm font-medium cursor-pointer">Uppercase</label>
              </div>

              <div className="flex items-center gap-2 pt-6">
                <input
                  type="checkbox"
                  id="uuid-braces"
                  checked={uuidBraces}
                  onChange={e => setUuidBraces(e.target.checked)}
                  className="w-4 h-4 rounded text-accent"
                />
                <label htmlFor="uuid-braces" className="text-sm font-medium cursor-pointer">Wrap in Braces {}</label>
              </div>
            </div>

            <button onClick={generateUuids} className="btn bp w-full py-3 text-base font-bold">
              Generate UUID v4
            </button>
          </div>

          {output && (
            <div className="fg">
              <div className="flex items-center justify-between mb-2">
                <label className="fl">Generated UUID(s)</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleCopyText(output, 'uuid')}
                    className="p-1.5 text-text-muted hover:text-text-primary hover:bg-bg-secondary rounded-md transition-colors flex items-center gap-1 text-xs font-semibold"
                  >
                    {copied === 'uuid' ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
                    Copy All
                  </button>
                </div>
              </div>
              <textarea
                className="fta min-h-[220px] font-mono text-sm bg-bg-secondary"
                value={output}
                readOnly
              />
            </div>
          )}
        </div>
      )}

      {/* 5. HASH GENERATOR */}
      {toolId === 'hash-generator' && (
        <div className="space-y-6 max-w-4xl mx-auto">
          <div className="fg">
            <label className="fl">Enter Text to Hash</label>
            <textarea
              className="fta min-h-[140px] font-mono text-sm"
              value={input}
              onChange={e => {
                setInput(e.target.value);
                generateHashes(e.target.value);
              }}
              placeholder="Type or paste plain text to calculate cryptographic hashes in real-time..."
            />
          </div>

          {Object.keys(hashes).length > 0 && (
            <div className="space-y-3">
              <label className="fl">Calculated Hash Digest</label>
              {Object.entries(hashes).map(([algo, hashVal]) => (
                <div key={algo} className="bg-surface border border-border p-4 rounded-xl shadow-sm">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold text-accent">{algo}</span>
                    <button
                      onClick={() => handleCopyText(hashVal, algo)}
                      className="text-xs text-text-muted hover:text-accent font-semibold flex items-center gap-1 transition-colors"
                    >
                      {copied === algo ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
                      {copied === algo ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <div className="font-mono text-xs font-semibold text-text-primary break-all bg-bg-secondary p-2 rounded-lg select-all">
                    {hashVal}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 6. HTML/CSS/JS MINIFIER */}
      {(toolId === 'html-css-js-minifier' || toolId === 'html-minifier-online') && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 bg-surface border border-border p-4 rounded-xl shadow-sm">
            <div className="flex items-center gap-2">
              {(['html', 'css', 'js'] as const).map(type => (
                <button
                  key={type}
                  onClick={() => setMinifyType(type)}
                  className={`px-4 py-2 rounded-lg text-xs font-bold uppercase transition-colors ${minifyType === type ? 'bg-accent text-white' : 'bg-bg-secondary text-text-muted hover:bg-border'}`}
                >
                  {type}
                </button>
              ))}
            </div>

            {minifyStats && (
              <div className="text-xs text-text-muted flex items-center gap-4">
                <span>Original: <strong>{(minifyStats.orig / 1024).toFixed(2)} KB</strong></span>
                <span>Minified: <strong>{(minifyStats.min / 1024).toFixed(2)} KB</strong></span>
                <span className="text-success font-bold">Saved: {((minifyStats.saved / (minifyStats.orig || 1)) * 100).toFixed(1)}%</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="fg">
              <div className="flex items-center justify-between mb-2">
                <label className="fl">Source {minifyType.toUpperCase()} Code</label>
                <button onClick={() => { setInput(''); setOutput(''); setMinifyStats(null); }} className="p-1.5 text-text-muted hover:text-red-500 rounded-md">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <textarea
                className="fta min-h-[360px] font-mono text-sm"
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder={`Paste unminified ${minifyType.toUpperCase()} code here...`}
              />
              <div className="flex gap-3 mt-4">
                <button onClick={() => runMinifier('minify')} className="btn bp flex-1 py-2.5 font-bold">
                  Minify {minifyType.toUpperCase()}
                </button>
                <button onClick={() => runMinifier('beautify')} className="btn bs2 flex-1 py-2.5 font-bold">
                  Format / Beautify
                </button>
              </div>
            </div>

            <div className="fg">
              <div className="flex items-center justify-between mb-2">
                <label className="fl">Processed Output</label>
                <button
                  onClick={() => handleCopyText(output, 'min-out')}
                  disabled={!output}
                  className="p-1.5 text-text-muted hover:text-text-primary rounded-md disabled:opacity-50"
                >
                  {copied === 'min-out' ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
              <textarea
                className="fta min-h-[360px] font-mono text-sm bg-bg-secondary"
                value={output}
                readOnly
                placeholder="Minified code will appear here..."
              />
            </div>
          </div>
        </div>
      )}

      {/* 7. BASE64 & URL ENCODE/DECODE */}
      {(toolId === 'base64-encode-decode' || toolId === 'base64-encoder-decoder' || toolId === 'url-encode-decode' || toolId === 'url-encoder-decoder') && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="fg">
            <div className="flex items-center justify-between mb-2">
              <label className="fl">Input Text</label>
              <button
                onClick={() => { setInput(''); setOutput(''); }}
                className="p-1.5 text-text-muted hover:text-red-500 hover:bg-red-500/10 rounded-md transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <textarea
              className="fta min-h-[260px] font-mono text-sm"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Enter text to encode or decode..."
            />

            <div className="flex flex-wrap gap-2 mt-4">
              {(toolId === 'base64-encode-decode' || toolId === 'base64-encoder-decoder') && (
                <>
                  <button onClick={() => processEncoding('b64-enc')} className="btn bp flex-1">Encode Base64</button>
                  <button onClick={() => processEncoding('b64-dec')} className="btn bs2 flex-1">Decode Base64</button>
                </>
              )}

              {(toolId === 'url-encode-decode' || toolId === 'url-encoder-decoder') && (
                <>
                  <button onClick={() => processEncoding('url-comp-enc')} className="btn bp flex-1">Encode URL</button>
                  <button onClick={() => processEncoding('url-comp-dec')} className="btn bs2 flex-1">Decode URL</button>
                </>
              )}
            </div>
          </div>

          <div className="fg">
            <div className="flex items-center justify-between mb-2">
              <label className="fl">Output Text</label>
              <button
                onClick={() => handleCopyText(output, 'enc-out')}
                disabled={!output}
                className="p-1.5 text-text-muted hover:text-text-primary hover:bg-bg-secondary rounded-md transition-colors disabled:opacity-50"
              >
                {copied === 'enc-out' ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
            <textarea
              className="fta min-h-[260px] font-mono text-sm bg-bg-secondary"
              value={output}
              readOnly
              placeholder="Result will appear here..."
            />
          </div>
        </div>
      )}
    </div>
  );
}

