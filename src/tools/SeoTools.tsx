import React, { useState, useEffect } from 'react';
import { Copy, Trash2, Check, RefreshCw, Hash, Link as LinkIcon, Image as ImageIcon, FileText } from 'lucide-react';

export default function SeoTools({ toolId }: { toolId: string }) {
  const [inputs, setInputs] = useState<any>({});
  const [output, setOutput] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setInputs({});
    setOutput('');
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
      case 'meta-gen':
        res = `<meta name="title" content="${inputs.title || ''}">\n<meta name="description" content="${inputs.desc || ''}">\n<meta name="keywords" content="${inputs.keys || ''}">\n<meta name="robots" content="index, follow">\n<meta http-equiv="Content-Type" content="text/html; charset=utf-8">\n<meta name="language" content="English">`;
        break;
      case 'robots-gen':
        res = `User-agent: *\nDisallow: ${inputs.disallow || '/cgi-bin/'}\nAllow: /\nSitemap: ${inputs.sitemap || 'https://example.com/sitemap.xml'}`;
        break;
      case 'slug-gen':
        res = (inputs.text || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
        break;
      case 'og-gen':
        res = `<meta property="og:title" content="${inputs.title || ''}">\n<meta property="og:description" content="${inputs.desc || ''}">\n<meta property="og:image" content="${inputs.img || ''}">\n<meta property="og:url" content="${inputs.url || ''}">\n<meta property="og:type" content="website">`;
        break;
      case 'keyword-density':
        const text = (inputs.text || '').toLowerCase();
        const words = text.match(/\b\w+\b/g) || [];
        const counts: any = {};
        words.forEach((w: string) => { counts[w] = (counts[w] || 0) + 1; });
        const sorted = Object.entries(counts).sort((a: any, b: any) => b[1] - a[1]).slice(0, 10);
        res = sorted.map(([w, c]) => `${w}: ${c} (${((c as number / words.length) * 100).toFixed(2)}%)`).join('\n');
        break;
      case 'seo-title':
        const t = inputs.topic || 'Keyword';
        res = `1. The Ultimate Guide to ${t}\n2. 10 Best ${t} Strategies for 2026\n3. How to Master ${t} in 5 Steps\n4. ${t}: Everything You Need to Know\n5. Top 7 Secrets About ${t} Revealed`;
        break;
      case 'seo-desc':
        const kw = inputs.topic || 'Keyword';
        res = `Looking for the best information on ${kw}? Discover our comprehensive guide covering top strategies, expert tips, and everything you need to know about ${kw}. Read more now!`;
        break;
    }
    setOutput(res);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="fg">
          {toolId === 'meta-gen' && (
            <>
              <div className="fg mb-4"><label className="fl">Site Title</label><input type="text" className="fi" value={inputs.title || ''} onChange={e => setInputs({...inputs, title: e.target.value})} /></div>
              <div className="fg mb-4"><label className="fl">Site Description</label><textarea className="fta min-h-[100px]" value={inputs.desc || ''} onChange={e => setInputs({...inputs, desc: e.target.value})} /></div>
              <div className="fg mb-4"><label className="fl">Keywords (comma separated)</label><input type="text" className="fi" value={inputs.keys || ''} onChange={e => setInputs({...inputs, keys: e.target.value})} /></div>
            </>
          )}
          {toolId === 'robots-gen' && (
            <>
              <div className="fg mb-4"><label className="fl">Disallow Path</label><input type="text" className="fi" value={inputs.disallow || ''} onChange={e => setInputs({...inputs, disallow: e.target.value})} placeholder="/private/" /></div>
              <div className="fg mb-4"><label className="fl">Sitemap URL</label><input type="url" className="fi" value={inputs.sitemap || ''} onChange={e => setInputs({...inputs, sitemap: e.target.value})} placeholder="https://example.com/sitemap.xml" /></div>
            </>
          )}
          {toolId === 'slug-gen' && (
            <div className="fg mb-4"><label className="fl">Enter Text to Slugify</label><input type="text" className="fi" value={inputs.text || ''} onChange={e => setInputs({...inputs, text: e.target.value})} placeholder="My Awesome Blog Post Title!" /></div>
          )}
          {toolId === 'og-gen' && (
            <>
              <div className="fg mb-4"><label className="fl">OG Title</label><input type="text" className="fi" value={inputs.title || ''} onChange={e => setInputs({...inputs, title: e.target.value})} /></div>
              <div className="fg mb-4"><label className="fl">OG Description</label><textarea className="fta min-h-[100px]" value={inputs.desc || ''} onChange={e => setInputs({...inputs, desc: e.target.value})} /></div>
              <div className="fg mb-4"><label className="fl">OG Image URL</label><input type="url" className="fi" value={inputs.img || ''} onChange={e => setInputs({...inputs, img: e.target.value})} /></div>
              <div className="fg mb-4"><label className="fl">OG URL</label><input type="url" className="fi" value={inputs.url || ''} onChange={e => setInputs({...inputs, url: e.target.value})} /></div>
            </>
          )}
          {toolId === 'keyword-density' && (
            <div className="fg mb-4"><label className="fl">Enter Content</label><textarea className="fta min-h-[200px]" value={inputs.text || ''} onChange={e => setInputs({...inputs, text: e.target.value})} /></div>
          )}
          {(toolId === 'seo-title' || toolId === 'seo-desc') && (
            <div className="fg mb-4"><label className="fl">Main Keyword / Topic</label><input type="text" className="fi" value={inputs.topic || ''} onChange={e => setInputs({...inputs, topic: e.target.value})} placeholder="e.g. Digital Marketing" /></div>
          )}

          <button onClick={generate} className="btn bp w-full mt-4 gap-2">
            <RefreshCw className="w-4 h-4" /> Generate
          </button>
        </div>

        <div className="fg">
          <div className="flex items-center justify-between mb-2">
            <label className="fl">Output</label>
            <button onClick={handleCopy} disabled={!output} className="p-1.5 text-text-muted hover:text-text-primary hover:bg-bg-secondary rounded-md transition-colors disabled:opacity-50">
              {copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
          <textarea className="fta min-h-[300px] bg-bg-secondary font-mono" value={output} readOnly placeholder="Result will appear here..." />
        </div>
      </div>
    </div>
  );
}
