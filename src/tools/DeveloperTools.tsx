import React, { useState, useEffect } from 'react';
import { Copy, Trash2, Check, Code } from 'lucide-react';

export default function DeveloperTools({ toolId }: { toolId: string }) {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setInput('');
    setOutput('');
  }, [toolId]);

  const handleCopy = () => {
    if (!output) return;
    navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const process = (action: string) => {
    let res = '';
    try {
      switch (toolId) {
        case 'base64':
          if (action === 'enc') res = btoa(unescape(encodeURIComponent(input)));
          if (action === 'dec') res = decodeURIComponent(escape(atob(input)));
          break;
        case 'url-codec':
          if (action === 'enc') res = encodeURIComponent(input);
          if (action === 'dec') res = decodeURIComponent(input);
          break;
        case 'color-conv':
          if (action === 'hex2rgb') {
            const hex = input.replace('#', '');
            const r = parseInt(hex.substring(0, 2), 16);
            const g = parseInt(hex.substring(2, 4), 16);
            const b = parseInt(hex.substring(4, 6), 16);
            res = `rgb(${r}, ${g}, ${b})`;
          }
          if (action === 'rgb2hex') {
            const rgb = input.match(/\d+/g);
            if (rgb) {
              res = '#' + rgb.map(x => parseInt(x).toString(16).padStart(2, '0')).join('');
            }
          }
          break;
        case 'uuid-gen':
          res = crypto.randomUUID();
          break;
        case 'html-min':
          res = input.replace(/<!--[\s\S]*?-->/g, '').replace(/\s+/g, ' ').trim();
          break;
      }
    } catch (e: any) {
      res = 'Error: ' + e.message;
    }
    setOutput(res);
  };

  return (
    <div className="space-y-6">
      {toolId === 'html-preview' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="fg">
            <label className="fl">HTML Code</label>
            <textarea className="fta min-h-[400px] font-mono text-sm" value={input} onChange={e => setInput(e.target.value)} placeholder="<h1>Hello World</h1>" />
          </div>
          <div className="fg">
            <label className="fl">Live Preview</label>
            <div className="bg-white border border-border rounded-[9px] min-h-[400px] overflow-hidden">
              <iframe srcDoc={input} className="w-full h-full min-h-[400px]" title="preview" sandbox="allow-scripts" />
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="fg">
            <div className="flex items-center justify-between mb-2">
              <label className="fl">Input</label>
              <button onClick={() => { setInput(''); setOutput(''); }} className="p-1.5 text-text-muted hover:text-red-500 hover:bg-red-500/10 rounded-md transition-colors">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <textarea className="fta min-h-[200px]" value={input} onChange={e => setInput(e.target.value)} placeholder="Enter data here..." />
            
            <div className="brow">
              {toolId === 'base64' && (
                <>
                  <button onClick={() => process('enc')} className="btn bp">Encode Base64</button>
                  <button onClick={() => process('dec')} className="btn bs2">Decode Base64</button>
                </>
              )}
              {toolId === 'url-codec' && (
                <>
                  <button onClick={() => process('enc')} className="btn bp">URL Encode</button>
                  <button onClick={() => process('dec')} className="btn bs2">URL Decode</button>
                </>
              )}
              {toolId === 'color-conv' && (
                <>
                  <button onClick={() => process('hex2rgb')} className="btn bp">HEX to RGB</button>
                  <button onClick={() => process('rgb2hex')} className="btn bs2">RGB to HEX</button>
                </>
              )}
              {toolId === 'uuid-gen' && (
                <button onClick={() => process('gen')} className="btn bp w-full">Generate New UUID</button>
              )}
              {toolId === 'html-min' && (
                <button onClick={() => process('min')} className="btn bp w-full">Minify HTML</button>
              )}
            </div>
          </div>

          <div className="fg">
            <div className="flex items-center justify-between mb-2">
              <label className="fl">Output</label>
              <button onClick={handleCopy} disabled={!output} className="p-1.5 text-text-muted hover:text-text-primary hover:bg-bg-secondary rounded-md transition-colors disabled:opacity-50">
                {copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
            <textarea className="fta min-h-[200px] bg-bg-secondary" value={output} readOnly placeholder="Result will appear here..." />
          </div>
        </div>
      )}
    </div>
  );
}
