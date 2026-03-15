import { useState } from 'react';
import { Copy, Trash2, Check, AlertCircle } from 'lucide-react';

export default function JsonFormatter() {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleFormat = () => {
    try {
      if (!input.trim()) {
        setOutput('');
        setError(null);
        return;
      }
      const parsed = JSON.parse(input);
      setOutput(JSON.stringify(parsed, null, 2));
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Invalid JSON');
      setOutput('');
    }
  };

  const handleMinify = () => {
    try {
      if (!input.trim()) {
        setOutput('');
        setError(null);
        return;
      }
      const parsed = JSON.parse(input);
      setOutput(JSON.stringify(parsed));
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Invalid JSON');
      setOutput('');
    }
  };

  const handleCopy = () => {
    if (!output) return;
    navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="fg">
          <div className="flex items-center justify-between mb-2">
            <label className="fl">Input JSON</label>
            <button 
              onClick={() => { setInput(''); setOutput(''); setError(null); }} 
              className="p-1.5 text-text-muted hover:text-red-500 hover:bg-red-500/10 rounded-md transition-colors" 
              title="Clear input"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
          <textarea
            className="fta min-h-[400px] text-sm"
            placeholder='{"key": "value"}'
            value={input}
            onChange={(e) => setInput(e.target.value)}
            spellCheck={false}
          />
          <div className="brow">
            <button onClick={handleFormat} className="btn bp flex-1">Format JSON</button>
            <button onClick={handleMinify} className="btn bs2 flex-1">Minify JSON</button>
          </div>
        </div>

        <div className="fg">
          <div className="flex items-center justify-between mb-2">
            <label className="fl">Output</label>
            <button 
              onClick={handleCopy} 
              disabled={!output}
              className="p-1.5 text-text-muted hover:text-text-primary hover:bg-bg-secondary rounded-md transition-colors disabled:opacity-50" 
              title="Copy output"
            >
              {copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
          
          {error ? (
            <div className="bg-red-500/10 border border-red-500/20 rounded-[9px] p-4 min-h-[400px] flex flex-col items-center justify-center text-center">
              <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
              <h3 className="text-red-600 font-bold text-lg mb-2">Invalid JSON</h3>
              <p className="text-red-500/80 font-mono text-sm break-all">{error}</p>
            </div>
          ) : (
            <textarea
              className="fta min-h-[400px] text-sm bg-bg-secondary cursor-text"
              value={output}
              readOnly
              placeholder="Result will appear here..."
              spellCheck={false}
            />
          )}
        </div>
      </div>
    </div>
  );
}
