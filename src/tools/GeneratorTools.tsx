import React, { useState, useEffect } from 'react';
import { Copy, Trash2, Check, RefreshCw, Settings } from 'lucide-react';

export default function GeneratorTools({ toolId }: { toolId: string }) {
  const [output, setOutput] = useState('');
  const [copied, setCopied] = useState(false);
  const [options, setOptions] = useState<any>({});
  const [history, setHistory] = useState<string[]>([]);

  useEffect(() => {
    setOutput('');
    setHistory([]);
    if (toolId === 'password-generator') setOptions({ len: 16, uc: true, lc: true, num: true, sym: true, excludeSimilar: false });
    if (toolId === 'username-generator') setOptions({ type: 'random', includeNum: true, leetspeak: false });
    if (toolId === 'random-number-generator') setOptions({ min: 1, max: 100, count: 1, duplicates: true, sort: 'none', decimal: 0 });
    if (toolId === 'random-name-picker') setOptions({ names: '', count: 1, removePicked: false });
    if (toolId === 'color-palette-generator') setOptions({ type: 'random' });
    if (toolId === 'fake-address-generator') setOptions({ country: 'US', includeProfile: true });
  }, [toolId]);

  const handleCopy = (text: string = output) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const generate = () => {
    let res = '';
    switch (toolId) {
      case 'password-generator':
        let uc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        let lc = 'abcdefghijklmnopqrstuvwxyz';
        let num = '0123456789';
        let sym = '!@#$%^&*()_+~`|}{[]:;?><,./-=';
        
        if (options.excludeSimilar) {
          uc = uc.replace(/[ILO]/g, '');
          lc = lc.replace(/[ilo]/g, '');
          num = num.replace(/[01]/g, '');
        }

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

      case 'username-generator':
        const adjs = ['Cool', 'Happy', 'Fast', 'Smart', 'Brave', 'Wild', 'Silent', 'Neon', 'Cyber', 'Dark', 'Cosmic', 'Quantum', 'Epic', 'Mystic'];
        const nouns = ['Tiger', 'Dragon', 'Wolf', 'Eagle', 'Shark', 'Ninja', 'Ghost', 'Knight', 'Panda', 'Fox', 'Phoenix', 'Samurai', 'Wizard'];
        
        let base = adjs[Math.floor(Math.random() * adjs.length)] + nouns[Math.floor(Math.random() * nouns.length)];
        
        if (options.leetspeak) {
          base = base.replace(/[aA]/g, '4').replace(/[eE]/g, '3').replace(/[iI]/g, '1').replace(/[oO]/g, '0').replace(/[sS]/g, '5').replace(/[tT]/g, '7');
        }
        
        if (options.includeNum) {
          base += Math.floor(Math.random() * 9999);
        }
        res = base;
        break;

      case 'random-number-generator':
        const min = parseFloat(options.min || '1');
        const max = parseFloat(options.max || '100');
        const count = parseInt(options.count || '1');
        const decimals = parseInt(options.decimal || '0');
        let nums: number[] = [];
        
        let attempts = 0;
        while (nums.length < count && attempts < count * 10) {
          let n = Math.random() * (max - min) + min;
          n = parseFloat(n.toFixed(decimals));
          
          if (options.duplicates || !nums.includes(n)) {
            nums.push(n);
          }
          attempts++;
        }
        
        if (options.sort === 'asc') nums.sort((a, b) => a - b);
        if (options.sort === 'desc') nums.sort((a, b) => b - a);
        
        res = nums.join(', ');
        break;

      case 'random-name-picker':
        let names = (options.names || '').split('\n').filter((n: string) => n.trim() !== '');
        if (names.length === 0) {
          res = 'Please enter some names first.';
          break;
        }
        
        const pickCount = Math.min(parseInt(options.count || '1'), names.length);
        const picked = [];
        
        for (let i = 0; i < pickCount; i++) {
          const idx = Math.floor(Math.random() * names.length);
          picked.push(names[idx]);
          if (options.removePicked) {
            names.splice(idx, 1);
          }
        }
        
        if (options.removePicked) {
          setOptions({ ...options, names: names.join('\n') });
        }
        
        res = picked.join('\n');
        break;

      case 'color-palette-generator':
        const r = () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0');
        res = `#${r()}${r()}${r()}\n#${r()}${r()}${r()}\n#${r()}${r()}${r()}\n#${r()}${r()}${r()}\n#${r()}${r()}${r()}`;
        break;

      case 'fake-address-generator':
        const fNames = ['John', 'Jane', 'Alex', 'Emily', 'Michael', 'Sarah', 'David', 'Emma'];
        const lNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis'];
        const streets = ['Main St', 'Oak Ave', 'Pine Ln', 'Maple Dr', 'Cedar Ct', 'Elm St', 'Washington Blvd'];
        
        const countryData: any = {
          'US': { cities: ['New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix'], states: ['NY', 'CA', 'IL', 'TX', 'AZ'], zip: () => Math.floor(Math.random() * 89999) + 10000, phone: '+1' },
          'UK': { cities: ['London', 'Manchester', 'Birmingham', 'Leeds', 'Glasgow'], states: ['England', 'Scotland', 'Wales'], zip: () => 'SW1A 1AA', phone: '+44' },
          'CA': { cities: ['Toronto', 'Vancouver', 'Montreal', 'Calgary', 'Ottawa'], states: ['ON', 'BC', 'QC', 'AB'], zip: () => 'M5H 2N2', phone: '+1' },
          'AU': { cities: ['Sydney', 'Melbourne', 'Brisbane', 'Perth', 'Adelaide'], states: ['NSW', 'VIC', 'QLD', 'WA', 'SA'], zip: () => Math.floor(Math.random() * 8999) + 1000, phone: '+61' }
        };
        
        const cData = countryData[options.country || 'US'];
        const name = `${fNames[Math.floor(Math.random() * fNames.length)]} ${lNames[Math.floor(Math.random() * lNames.length)]}`;
        const address = `${Math.floor(Math.random() * 9999) + 1} ${streets[Math.floor(Math.random() * streets.length)]}\n${cData.cities[Math.floor(Math.random() * cData.cities.length)]}, ${cData.states[Math.floor(Math.random() * cData.states.length)]} ${cData.zip()}\n${options.country || 'US'}`;
        
        if (options.includeProfile) {
          const email = `${name.replace(' ', '.').toLowerCase()}${Math.floor(Math.random() * 100)}@example.com`;
          const phone = `${cData.phone} ${Math.floor(Math.random() * 899) + 100} ${Math.floor(Math.random() * 8999) + 1000}`;
          res = `Name: ${name}\nEmail: ${email}\nPhone: ${phone}\n\nAddress:\n${address}`;
        } else {
          res = address;
        }
        break;
    }
    
    setOutput(res);
    if (res && !res.includes('Please enter')) {
      setHistory(prev => [res, ...prev].slice(0, 10));
    }
  };

  const calculatePasswordStrength = (pass: string) => {
    let score = 0;
    if (pass.length > 8) score += 1;
    if (pass.length > 12) score += 1;
    if (/[A-Z]/.test(pass)) score += 1;
    if (/[0-9]/.test(pass)) score += 1;
    if (/[^A-Za-z0-9]/.test(pass)) score += 1;
    return score;
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-bg-secondary p-6 rounded-xl border border-border">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Settings className="w-5 h-5 text-accent" /> Configuration
          </h3>
          
          {/* PASSWORD GENERATOR */}
          {toolId === 'password-generator' && (
            <div className="space-y-4">
              <div>
                <div className="flex justify-between mb-2">
                  <label className="text-sm font-medium">Password Length</label>
                  <span className="text-accent font-bold">{options.len}</span>
                </div>
                <input type="range" min="4" max="128" value={options.len || 16} onChange={e => setOptions({...options, len: parseInt(e.target.value)})} className="w-full accent-accent" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex items-center gap-2 p-2 bg-bg-primary rounded-lg border border-border cursor-pointer hover:border-accent transition-colors">
                  <input type="checkbox" checked={options.uc || false} onChange={e => setOptions({...options, uc: e.target.checked})} className="accent-accent w-4 h-4" /> 
                  <span className="text-sm">Uppercase (A-Z)</span>
                </label>
                <label className="flex items-center gap-2 p-2 bg-bg-primary rounded-lg border border-border cursor-pointer hover:border-accent transition-colors">
                  <input type="checkbox" checked={options.lc || false} onChange={e => setOptions({...options, lc: e.target.checked})} className="accent-accent w-4 h-4" /> 
                  <span className="text-sm">Lowercase (a-z)</span>
                </label>
                <label className="flex items-center gap-2 p-2 bg-bg-primary rounded-lg border border-border cursor-pointer hover:border-accent transition-colors">
                  <input type="checkbox" checked={options.num || false} onChange={e => setOptions({...options, num: e.target.checked})} className="accent-accent w-4 h-4" /> 
                  <span className="text-sm">Numbers (0-9)</span>
                </label>
                <label className="flex items-center gap-2 p-2 bg-bg-primary rounded-lg border border-border cursor-pointer hover:border-accent transition-colors">
                  <input type="checkbox" checked={options.sym || false} onChange={e => setOptions({...options, sym: e.target.checked})} className="accent-accent w-4 h-4" /> 
                  <span className="text-sm">Symbols (!@#$)</span>
                </label>
              </div>
              <label className="flex items-center gap-2 p-2 bg-bg-primary rounded-lg border border-border cursor-pointer hover:border-accent transition-colors">
                <input type="checkbox" checked={options.excludeSimilar || false} onChange={e => setOptions({...options, excludeSimilar: e.target.checked})} className="accent-accent w-4 h-4" /> 
                <span className="text-sm">Exclude Similar Characters (i, l, 1, L, o, 0, O)</span>
              </label>
            </div>
          )}

          {/* USERNAME GENERATOR */}
          {toolId === 'username-generator' && (
            <div className="space-y-4">
              <label className="flex items-center gap-2 p-3 bg-bg-primary rounded-lg border border-border cursor-pointer hover:border-accent transition-colors">
                <input type="checkbox" checked={options.includeNum || false} onChange={e => setOptions({...options, includeNum: e.target.checked})} className="accent-accent w-4 h-4" /> 
                <span className="text-sm font-medium">Include Numbers</span>
              </label>
              <label className="flex items-center gap-2 p-3 bg-bg-primary rounded-lg border border-border cursor-pointer hover:border-accent transition-colors">
                <input type="checkbox" checked={options.leetspeak || false} onChange={e => setOptions({...options, leetspeak: e.target.checked})} className="accent-accent w-4 h-4" /> 
                <span className="text-sm font-medium">Use Leetspeak (e.g., E -&gt; 3, A -&gt; 4)</span>
              </label>
            </div>
          )}

          {/* RANDOM NUMBER GENERATOR */}
          {toolId === 'random-number-generator' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Minimum</label>
                  <input type="number" className="w-full p-2 bg-bg-primary border border-border rounded-lg focus:ring-2 focus:ring-accent outline-none" value={options.min || 1} onChange={e => setOptions({...options, min: e.target.value})} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Maximum</label>
                  <input type="number" className="w-full p-2 bg-bg-primary border border-border rounded-lg focus:ring-2 focus:ring-accent outline-none" value={options.max || 100} onChange={e => setOptions({...options, max: e.target.value})} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Count</label>
                  <input type="number" min="1" max="10000" className="w-full p-2 bg-bg-primary border border-border rounded-lg focus:ring-2 focus:ring-accent outline-none" value={options.count || 1} onChange={e => setOptions({...options, count: e.target.value})} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Decimal Places</label>
                  <input type="number" min="0" max="10" className="w-full p-2 bg-bg-primary border border-border rounded-lg focus:ring-2 focus:ring-accent outline-none" value={options.decimal || 0} onChange={e => setOptions({...options, decimal: e.target.value})} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <label className="flex items-center gap-2 p-2 bg-bg-primary rounded-lg border border-border cursor-pointer hover:border-accent transition-colors">
                  <input type="checkbox" checked={options.duplicates ?? true} onChange={e => setOptions({...options, duplicates: e.target.checked})} className="accent-accent w-4 h-4" /> 
                  <span className="text-sm">Allow Duplicates</span>
                </label>
                <select className="p-2 bg-bg-primary border border-border rounded-lg focus:ring-2 focus:ring-accent outline-none" value={options.sort || 'none'} onChange={e => setOptions({...options, sort: e.target.value})}>
                  <option value="none">Do not sort</option>
                  <option value="asc">Sort Ascending</option>
                  <option value="desc">Sort Descending</option>
                </select>
              </div>
            </div>
          )}

          {/* RANDOM NAME PICKER */}
          {toolId === 'random-name-picker' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Enter Names (one per line)</label>
                <textarea 
                  className="w-full p-3 bg-bg-primary border border-border rounded-lg focus:ring-2 focus:ring-accent outline-none min-h-[150px] resize-y" 
                  value={options.names || ''} 
                  onChange={e => setOptions({...options, names: e.target.value})} 
                  placeholder="Alice&#10;Bob&#10;Charlie&#10;David" 
                />
                <div className="text-xs text-text-muted mt-1 text-right">
                  Total names: {(options.names || '').split('\n').filter((n: string) => n.trim() !== '').length}
                </div>
              </div>
              <div className="flex gap-4 items-end">
                <div className="flex-1">
                  <label className="block text-sm font-medium mb-1">Number of names to pick</label>
                  <input type="number" min="1" className="w-full p-2 bg-bg-primary border border-border rounded-lg focus:ring-2 focus:ring-accent outline-none" value={options.count || 1} onChange={e => setOptions({...options, count: e.target.value})} />
                </div>
                <label className="flex-1 flex items-center gap-2 p-2 h-[42px] bg-bg-primary rounded-lg border border-border cursor-pointer hover:border-accent transition-colors">
                  <input type="checkbox" checked={options.removePicked || false} onChange={e => setOptions({...options, removePicked: e.target.checked})} className="accent-accent w-4 h-4" /> 
                  <span className="text-sm">Remove picked names</span>
                </label>
              </div>
            </div>
          )}

          {/* COLOR PALETTE GENERATOR */}
          {toolId === 'color-palette-generator' && (
            <div className="space-y-4">
              <p className="text-sm text-text-muted">Click generate to create a new random color palette. You can click on individual colors in the result to copy their HEX codes.</p>
            </div>
          )}

          {/* FAKE ADDRESS GENERATOR */}
          {toolId === 'fake-address-generator' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Country</label>
                <select className="w-full p-2 bg-bg-primary border border-border rounded-lg focus:ring-2 focus:ring-accent outline-none" value={options.country || 'US'} onChange={e => setOptions({...options, country: e.target.value})}>
                  <option value="US">United States</option>
                  <option value="UK">United Kingdom</option>
                  <option value="CA">Canada</option>
                  <option value="AU">Australia</option>
                </select>
              </div>
              <label className="flex items-center gap-2 p-3 bg-bg-primary rounded-lg border border-border cursor-pointer hover:border-accent transition-colors">
                <input type="checkbox" checked={options.includeProfile ?? true} onChange={e => setOptions({...options, includeProfile: e.target.checked})} className="accent-accent w-4 h-4" /> 
                <span className="text-sm font-medium">Include Full Profile (Name, Phone, Email)</span>
              </label>
            </div>
          )}

          <button onClick={generate} className="w-full mt-6 py-3 px-4 bg-accent hover:bg-accent/90 text-white rounded-lg font-medium flex items-center justify-center gap-2 transition-colors shadow-lg shadow-accent/20">
            <RefreshCw className="w-5 h-5" /> Generate Now
          </button>
        </div>

        <div className="bg-bg-secondary p-6 rounded-xl border border-border flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Check className="w-5 h-5 text-success" /> Result
            </h3>
            <button 
              onClick={() => handleCopy(output)} 
              disabled={!output} 
              className="px-3 py-1.5 text-sm font-medium bg-bg-primary border border-border hover:border-accent text-text-primary rounded-md transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {copied ? <><Check className="w-4 h-4 text-success" /> Copied</> : <><Copy className="w-4 h-4" /> Copy</>}
            </button>
          </div>
          
          {toolId === 'color-palette-generator' && output ? (
            <div className="flex flex-col sm:flex-row gap-2 h-full min-h-[250px]">
              {output.split('\n').map((color, i) => (
                <div 
                  key={i} 
                  onClick={() => handleCopy(color)}
                  className="flex-1 rounded-lg flex flex-col items-center justify-center font-mono font-bold text-white shadow-inner cursor-pointer hover:scale-[1.02] transition-transform group relative" 
                  style={{ backgroundColor: color, textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}
                >
                  <span className="text-lg">{color}</span>
                  <span className="text-xs opacity-0 group-hover:opacity-100 transition-opacity absolute bottom-4 bg-black/50 px-2 py-1 rounded">Copy</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex-1 relative">
              <textarea
                className={`w-full h-full min-h-[250px] p-4 bg-bg-primary border border-border rounded-lg outline-none resize-none ${toolId === 'password-generator' || toolId === 'username-generator' ? 'text-3xl text-center font-bold flex items-center justify-center' : 'text-base font-mono'}`}
                value={output}
                readOnly
                placeholder="Generated result will appear here..."
              />
              {toolId === 'password-generator' && output && (
                <div className="absolute bottom-4 left-0 right-0 flex justify-center">
                  <div className="bg-bg-secondary border border-border px-4 py-2 rounded-full flex items-center gap-2 shadow-lg">
                    <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">Strength:</span>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map(level => (
                        <div 
                          key={level} 
                          className={`w-8 h-2 rounded-full ${calculatePasswordStrength(output) >= level ? (calculatePasswordStrength(output) <= 2 ? 'bg-error' : calculatePasswordStrength(output) <= 3 ? 'bg-warning' : 'bg-success') : 'bg-border'}`}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      
      {/* History Section */}
      {history.length > 1 && toolId !== 'color-palette-generator' && (
        <div className="bg-bg-secondary p-6 rounded-xl border border-border">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <RefreshCw className="w-5 h-5 text-text-muted" /> Recent Generations
            </h3>
            <button onClick={() => setHistory([])} className="text-sm text-error hover:underline flex items-center gap-1">
              <Trash2 className="w-4 h-4" /> Clear History
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {history.slice(1).map((item, idx) => (
              <div key={idx} className="p-3 bg-bg-primary border border-border rounded-lg flex justify-between items-center group">
                <span className="truncate font-mono text-sm mr-2">{item.length > 30 ? item.substring(0, 30) + '...' : item}</span>
                <button onClick={() => handleCopy(item)} className="text-text-muted hover:text-accent opacity-0 group-hover:opacity-100 transition-opacity">
                  <Copy className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
