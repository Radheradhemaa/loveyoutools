import React, { useState, useEffect } from 'react';
import { Copy, Trash2, ArrowRightLeft, Check } from 'lucide-react';

export default function TextTools({ toolId }: { toolId: string }) {
  const [input, setInput] = useState('');
  const [input2, setInput2] = useState('');
  const [output, setOutput] = useState('');
  const [copied, setCopied] = useState(false);
  const [options, setOptions] = useState<any>({});

  useEffect(() => {
    setInput('');
    setInput2('');
    setOutput('');
    setOptions({});
  }, [toolId]);

  const handleCopy = () => {
    if (!output) return;
    navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const processText = (action: string) => {
    let res = '';
    switch (toolId) {
      case 'case-conv':
        if (action === 'upper') res = input.toUpperCase();
        if (action === 'lower') res = input.toLowerCase();
        if (action === 'title') res = input.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
        if (action === 'sentence') res = input.toLowerCase().replace(/(^\s*\w|[.!?]\s*\w)/g, (c) => c.toUpperCase());
        if (action === 'camel') res = input.replace(/(?:^\w|[A-Z]|\b\w)/g, (word, index) => index === 0 ? word.toLowerCase() : word.toUpperCase()).replace(/\s+/g, '');
        if (action === 'snake') res = input.match(/[A-Z]{2,}(?=[A-Z][a-z]+[0-9]*|\b)|[A-Z]?[a-z]+[0-9]*|[A-Z]|[0-9]+/g)?.map(x => x.toLowerCase()).join('_') || '';
        if (action === 'kebab') res = input.match(/[A-Z]{2,}(?=[A-Z][a-z]+[0-9]*|\b)|[A-Z]?[a-z]+[0-9]*|[A-Z]|[0-9]+/g)?.map(x => x.toLowerCase()).join('-') || '';
        break;
      case 'remove-dupes':
        const lines = input.split('\n');
        res = [...new Set(lines)].join('\n');
        break;
      case 'text-sort':
        let arr = input.split('\n');
        if (action === 'az') res = arr.sort().join('\n');
        if (action === 'za') res = arr.sort().reverse().join('\n');
        if (action === 'len') res = arr.sort((a, b) => a.length - b.length).join('\n');
        if (action === 'rev') res = arr.reverse().join('\n');
        break;
      case 'text-compare':
        // Simple diff
        const lines1 = input.split('\n');
        const lines2 = input2.split('\n');
        let diff = '';
        const max = Math.max(lines1.length, lines2.length);
        for(let i=0; i<max; i++) {
          if (lines1[i] === lines2[i]) diff += `  ${lines1[i] || ''}\n`;
          else {
            if (lines1[i] !== undefined) diff += `- ${lines1[i]}\n`;
            if (lines2[i] !== undefined) diff += `+ ${lines2[i]}\n`;
          }
        }
        res = diff;
        break;
      case 'whitespace-rm':
        if (action === 'trim') res = input.split('\n').map(l => l.trim()).join('\n');
        if (action === 'extra') res = input.replace(/[ \t]{2,}/g, ' ');
        if (action === 'all') res = input.replace(/\s+/g, '');
        if (action === 'empty') res = input.replace(/^\s*[\r\n]/gm, '');
        break;
      case 'lorem-gen':
        const paras = parseInt(options.paras || '3');
        const lorem = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.";
        res = Array(paras).fill(lorem).join('\n\n');
        break;
      case 'text-reverse':
        if (action === 'chars') res = input.split('').reverse().join('');
        if (action === 'words') res = input.split(' ').reverse().join(' ');
        if (action === 'lines') res = input.split('\n').reverse().join('\n');
        break;
      case 'text-encode':
        if (action === 'b64e') res = btoa(unescape(encodeURIComponent(input)));
        if (action === 'b64d') { try { res = decodeURIComponent(escape(atob(input))); } catch(e) { res = 'Invalid Base64'; } }
        if (action === 'urie') res = encodeURIComponent(input);
        if (action === 'urid') { try { res = decodeURIComponent(input); } catch(e) { res = 'Invalid URI'; } }
        if (action === 'rot13') res = input.replace(/[a-zA-Z]/g, char => {
          const c = char.charCodeAt(0);
          const limit = char <= 'Z' ? 90 : 122;
          const rotated = c + 13;
          return String.fromCharCode(limit >= rotated ? rotated : rotated - 26);
        });
        break;
    }
    setOutput(res);
  };

  return (
    <div className="space-y-6">
      {toolId === 'text-compare' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="fg">
            <label className="fl">Original Text</label>
            <textarea className="fta min-h-[60vh]" value={input} onChange={e => setInput(e.target.value)} />
          </div>
          <div className="fg">
            <label className="fl">Changed Text</label>
            <textarea className="fta min-h-[60vh]" value={input2} onChange={e => setInput2(e.target.value)} />
          </div>
          <div className="col-span-1 lg:col-span-2">
            <button onClick={() => processText('compare')} className="btn bp w-full">Compare Texts</button>
          </div>
        </div>
      ) : toolId === 'lorem-gen' ? (
        <div className="fg">
          <label className="fl">Number of Paragraphs</label>
          <input type="number" className="fi mb-4" value={options.paras || 3} onChange={e => setOptions({...options, paras: e.target.value})} min="1" max="100" />
          <button onClick={() => processText('gen')} className="btn bp">Generate Lorem Ipsum</button>
        </div>
      ) : (
        <div className="fg">
          <div className="flex items-center justify-between mb-2">
            <label className="fl">Input Text</label>
            <button onClick={() => { setInput(''); setOutput(''); }} className="p-1.5 text-text-muted hover:text-red-500 hover:bg-red-500/10 rounded-md transition-colors">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
          <textarea className="fta min-h-[60vh]" value={input} onChange={e => setInput(e.target.value)} placeholder="Enter text here..." />
          
          <div className="brow">
            {toolId === 'case-conv' && (
              <>
                <button onClick={() => processText('upper')} className="btn bs2">UPPERCASE</button>
                <button onClick={() => processText('lower')} className="btn bs2">lowercase</button>
                <button onClick={() => processText('title')} className="btn bs2">Title Case</button>
                <button onClick={() => processText('sentence')} className="btn bs2">Sentence case</button>
                <button onClick={() => processText('camel')} className="btn bs2">camelCase</button>
                <button onClick={() => processText('snake')} className="btn bs2">snake_case</button>
                <button onClick={() => processText('kebab')} className="btn bs2">kebab-case</button>
              </>
            )}
            {toolId === 'remove-dupes' && (
              <button onClick={() => processText('rm')} className="btn bp">Remove Duplicate Lines</button>
            )}
            {toolId === 'text-sort' && (
              <>
                <button onClick={() => processText('az')} className="btn bs2">Sort A-Z</button>
                <button onClick={() => processText('za')} className="btn bs2">Sort Z-A</button>
                <button onClick={() => processText('len')} className="btn bs2">Sort by Length</button>
                <button onClick={() => processText('rev')} className="btn bs2">Reverse Order</button>
              </>
            )}
            {toolId === 'whitespace-rm' && (
              <>
                <button onClick={() => processText('trim')} className="btn bs2">Trim Lines</button>
                <button onClick={() => processText('extra')} className="btn bs2">Remove Extra Spaces</button>
                <button onClick={() => processText('empty')} className="btn bs2">Remove Empty Lines</button>
                <button onClick={() => processText('all')} className="btn bs2">Remove All Whitespace</button>
              </>
            )}
            {toolId === 'text-reverse' && (
              <>
                <button onClick={() => processText('chars')} className="btn bs2">Reverse Characters</button>
                <button onClick={() => processText('words')} className="btn bs2">Reverse Words</button>
                <button onClick={() => processText('lines')} className="btn bs2">Reverse Lines</button>
              </>
            )}
            {toolId === 'text-encode' && (
              <>
                <button onClick={() => processText('b64e')} className="btn bs2">Base64 Encode</button>
                <button onClick={() => processText('b64d')} className="btn bs2">Base64 Decode</button>
                <button onClick={() => processText('urie')} className="btn bs2">URL Encode</button>
                <button onClick={() => processText('urid')} className="btn bs2">URL Decode</button>
                <button onClick={() => processText('rot13')} className="btn bs2">ROT13</button>
              </>
            )}
          </div>
        </div>
      )}

      <div className="fg mt-8">
        <div className="flex items-center justify-between mb-2">
          <label className="fl">Output</label>
          <button onClick={handleCopy} disabled={!output} className="p-1.5 text-text-muted hover:text-text-primary hover:bg-bg-secondary rounded-md transition-colors disabled:opacity-50">
            {copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>
        <textarea className="fta min-h-[60vh] bg-bg-secondary" value={output} readOnly placeholder="Result will appear here..." />
      </div>
    </div>
  );
}
