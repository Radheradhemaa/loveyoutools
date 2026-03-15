import React, { useState, useEffect } from 'react';
import { Copy, Trash2, Check, RefreshCw } from 'lucide-react';

export default function GeneratorTools({ toolId }: { toolId: string }) {
  const [output, setOutput] = useState('');
  const [copied, setCopied] = useState(false);
  const [options, setOptions] = useState<any>({});

  useEffect(() => {
    setOutput('');
    setOptions({});
    if (toolId === 'pass-gen') setOptions({ len: 16, uc: true, lc: true, num: true, sym: true });
    if (toolId === 'rand-num') setOptions({ min: 1, max: 100, count: 1 });
  }, [toolId]);

  const handleCopy = () => {
    if (!output) return;
    navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const generate = () => {
    let res = '';
    switch (toolId) {
      case 'pass-gen':
        const uc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        const lc = 'abcdefghijklmnopqrstuvwxyz';
        const num = '0123456789';
        const sym = '!@#$%^&*()_+~`|}{[]:;?><,./-=';
        let chars = '';
        if (options.uc) chars += uc;
        if (options.lc) chars += lc;
        if (options.num) chars += num;
        if (options.sym) chars += sym;
        if (!chars) chars = lc;
        for (let i = 0; i < (options.len || 16); i++) {
          res += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        break;
      case 'username-gen':
        const adjs = ['Cool', 'Happy', 'Fast', 'Smart', 'Brave', 'Wild', 'Silent', 'Neon', 'Cyber', 'Dark'];
        const nouns = ['Tiger', 'Dragon', 'Wolf', 'Eagle', 'Shark', 'Ninja', 'Ghost', 'Knight', 'Panda', 'Fox'];
        res = adjs[Math.floor(Math.random() * adjs.length)] + nouns[Math.floor(Math.random() * nouns.length)] + Math.floor(Math.random() * 999);
        break;
      case 'rand-num':
        const min = parseInt(options.min || '1');
        const max = parseInt(options.max || '100');
        const count = parseInt(options.count || '1');
        const nums = [];
        for (let i = 0; i < count; i++) {
          nums.push(Math.floor(Math.random() * (max - min + 1)) + min);
        }
        res = nums.join(', ');
        break;
      case 'name-picker':
        const names = (options.names || '').split('\n').filter((n: string) => n.trim() !== '');
        if (names.length > 0) {
          res = names[Math.floor(Math.random() * names.length)];
        } else {
          res = 'Please enter some names first.';
        }
        break;
      case 'color-palette':
        const r = () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0');
        res = `#${r()}${r()}${r()}\n#${r()}${r()}${r()}\n#${r()}${r()}${r()}\n#${r()}${r()}${r()}\n#${r()}${r()}${r()}`;
        break;
      case 'fake-addr':
        const streets = ['Main St', 'Oak Ave', 'Pine Ln', 'Maple Dr', 'Cedar Ct'];
        const cities = ['Springfield', 'Riverside', 'Centerville', 'Franklin', 'Greenville'];
        const states = ['CA', 'NY', 'TX', 'FL', 'IL'];
        res = `${Math.floor(Math.random() * 9999) + 1} ${streets[Math.floor(Math.random() * streets.length)]}\n${cities[Math.floor(Math.random() * cities.length)]}, ${states[Math.floor(Math.random() * states.length)]} ${Math.floor(Math.random() * 89999) + 10000}\nUnited States`;
        break;
    }
    setOutput(res);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="fg">
          {toolId === 'pass-gen' && (
            <>
              <label className="fl">Password Length: {options.len}</label>
              <input type="range" min="8" max="128" value={options.len || 16} onChange={e => setOptions({...options, len: parseInt(e.target.value)})} className="w-full accent-accent mb-4" />
              <div className="flex flex-col gap-2 mb-4">
                <label className="flex items-center gap-2"><input type="checkbox" checked={options.uc || false} onChange={e => setOptions({...options, uc: e.target.checked})} className="accent-accent" /> Uppercase (A-Z)</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={options.lc || false} onChange={e => setOptions({...options, lc: e.target.checked})} className="accent-accent" /> Lowercase (a-z)</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={options.num || false} onChange={e => setOptions({...options, num: e.target.checked})} className="accent-accent" /> Numbers (0-9)</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={options.sym || false} onChange={e => setOptions({...options, sym: e.target.checked})} className="accent-accent" /> Symbols (!@#$)</label>
              </div>
            </>
          )}
          {toolId === 'rand-num' && (
            <>
              <div className="frow mb-4">
                <div className="fg"><label className="fl">Min</label><input type="number" className="fi" value={options.min || 1} onChange={e => setOptions({...options, min: e.target.value})} /></div>
                <div className="fg"><label className="fl">Max</label><input type="number" className="fi" value={options.max || 100} onChange={e => setOptions({...options, max: e.target.value})} /></div>
              </div>
              <div className="fg mb-4"><label className="fl">Count</label><input type="number" className="fi" value={options.count || 1} onChange={e => setOptions({...options, count: e.target.value})} /></div>
            </>
          )}
          {toolId === 'name-picker' && (
            <div className="fg mb-4">
              <label className="fl">Enter Names (one per line)</label>
              <textarea className="fta" value={options.names || ''} onChange={e => setOptions({...options, names: e.target.value})} placeholder="Alice&#10;Bob&#10;Charlie" />
            </div>
          )}

          <button onClick={generate} className="btn bp w-full gap-2 mt-4">
            <RefreshCw className="w-4 h-4" /> Generate
          </button>
        </div>

        <div className="fg">
          <div className="flex items-center justify-between mb-2">
            <label className="fl">Result</label>
            <button onClick={handleCopy} disabled={!output} className="p-1.5 text-text-muted hover:text-text-primary hover:bg-bg-secondary rounded-md transition-colors disabled:opacity-50">
              {copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
          
          {toolId === 'color-palette' && output ? (
            <div className="flex flex-col gap-2 h-full min-h-[200px]">
              {output.split('\n').map((color, i) => (
                <div key={i} className="flex-1 rounded-lg flex items-center justify-center font-mono font-bold text-white shadow-inner" style={{ backgroundColor: color, textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}>
                  {color}
                </div>
              ))}
            </div>
          ) : (
            <textarea
              className={`fta h-full min-h-[200px] bg-bg-secondary ${toolId === 'pass-gen' || toolId === 'color-palette' ? 'text-2xl text-center font-bold' : ''}`}
              value={output}
              readOnly
              placeholder="Result will appear here..."
            />
          )}
        </div>
      </div>
    </div>
  );
}
