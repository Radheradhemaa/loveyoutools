import React, { useState, useEffect } from 'react';
import { Copy, Trash2, Check, RefreshCw, Hash, Link as LinkIcon, Image as ImageIcon, FileText, Search, Globe, Shield, Zap, BarChart3 } from 'lucide-react';
import { GoogleGenAI } from "@google/genai";

export default function SeoTools({ toolId }: { toolId: string }) {
  const [inputs, setInputs] = useState<any>({});
  const [output, setOutput] = useState('');
  const [loading, setLoading] = useState(false);
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

  const generate = async () => {
    setLoading(true);
    let res = '';
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
      switch (toolId) {
        case 'keyword-research-tool':
          if (!inputs.keyword) { res = 'Please enter a keyword.'; break; }
          const kwResponse = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: `As an SEO expert, provide a detailed keyword research report for: "${inputs.keyword}". 
            Include:
            1. Related Keywords (Long-tail)
            2. Search Intent (Informational, Transactional, etc.)
            3. Estimated Monthly Search Volume (Global)
            4. Keyword Difficulty (0-100)
            5. CPC (Estimated)
            6. Content Ideas for this keyword.
            Format the output in a clean, professional way.`,
          });
          res = kwResponse.text || 'Failed to generate report.';
          break;

        case 'backlink-checker':
          if (!inputs.url) { res = 'Please enter a URL.'; break; }
          const blResponse = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: `As an SEO tool, simulate a backlink analysis for the website: "${inputs.url}". 
            Provide a realistic report including:
            1. Total Backlinks (Estimated)
            2. Referring Domains
            3. Domain Rating (DR)
            4. Top Anchor Texts
            5. Top Linking Domains
            6. Do-follow vs No-follow ratio.
            Note: This is a simulated analysis based on general web knowledge.`,
          });
          res = blResponse.text || 'Failed to generate report.';
          break;

        case 'domain-authority-checker':
          if (!inputs.url) { res = 'Please enter a URL.'; break; }
          const daResponse = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: `As an SEO tool, simulate a Domain Authority (DA) and Page Authority (PA) check for: "${inputs.url}". 
            Include:
            1. Domain Authority (0-100)
            2. Page Authority (0-100)
            3. Spam Score (%)
            4. Total External Links
            5. Root Domains
            6. Ranking Keywords count.
            Note: This is a simulated analysis.`,
          });
          res = daResponse.text || 'Failed to generate report.';
          break;

        case 'plagiarism-checker':
          if (!inputs.text) { res = 'Please enter text to check.'; break; }
          const plResponse = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: `Analyze the following text for plagiarism and uniqueness. 
            Text: "${inputs.text}"
            Provide:
            1. Uniqueness Percentage
            2. Plagiarism Percentage
            3. Potential sources if plagiarized (simulated)
            4. Suggestions to improve uniqueness.`,
          });
          res = plResponse.text || 'Failed to generate report.';
          break;

        case 'website-speed-test':
          if (!inputs.url) { res = 'Please enter a URL.'; break; }
          const speedResponse = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: `As a website performance tool, simulate a speed test for: "${inputs.url}". 
            Provide a report similar to Google PageSpeed Insights:
            1. Performance Score (0-100)
            2. Core Web Vitals (LCP, FID, CLS)
            3. Time to Interactive
            4. Total Blocking Time
            5. Speed Index
            6. Opportunities for improvement (e.g., compress images, minify JS).
            Note: This is a simulated performance report.`,
          });
          res = speedResponse.text || 'Failed to generate report.';
          break;

        case 'meta-tag-generator':
          res = `<!-- Primary Meta Tags -->
<title>${inputs.title || 'Page Title'}</title>
<meta name="title" content="${inputs.title || 'Page Title'}">
<meta name="description" content="${inputs.desc || 'Page Description'}">
<meta name="keywords" content="${inputs.keys || 'keywords, separated, by, comma'}">

<!-- Open Graph / Facebook -->
<meta property="og:type" content="website">
<meta property="og:url" content="${inputs.url || 'https://example.com/'}">
<meta property="og:title" content="${inputs.title || 'Page Title'}">
<meta property="og:description" content="${inputs.desc || 'Page Description'}">
<meta property="og:image" content="${inputs.img || 'https://example.com/image.jpg'}">

<!-- Twitter -->
<meta property="twitter:card" content="summary_large_image">
<meta property="twitter:url" content="${inputs.url || 'https://example.com/'}">
<meta property="twitter:title" content="${inputs.title || 'Page Title'}">
<meta property="twitter:description" content="${inputs.desc || 'Page Description'}">
<meta property="twitter:image" content="${inputs.img || 'https://example.com/image.jpg'}">

<!-- Additional Tags -->
<meta name="robots" content="index, follow">
<meta http-equiv="Content-Type" content="text/html; charset=utf-8">
<meta name="language" content="English">
<meta name="revisit-after" content="7 days">
<meta name="author" content="${inputs.author || 'Author Name'}">`;
          break;

        case 'robots-txt-generator':
          res = `User-agent: *
Disallow: ${inputs.disallow || '/cgi-bin/'}
Disallow: /wp-admin/
Disallow: /tmp/
Allow: /

Sitemap: ${inputs.sitemap || 'https://example.com/sitemap.xml'}`;
          break;

        case 'keyword-density-checker':
          const text = (inputs.text || '').toLowerCase();
          const words = text.match(/\b\w+\b/g) || [];
          const counts: any = {};
          words.forEach((w: string) => { 
            if (w.length > 3) counts[w] = (counts[w] || 0) + 1; 
          });
          const sorted = Object.entries(counts).sort((a: any, b: any) => b[1] - a[1]).slice(0, 15);
          res = `Total Words: ${words.length}\n\nTop Keywords:\n` + sorted.map(([w, c]) => `- ${w}: ${c} times (${((c as number / words.length) * 100).toFixed(2)}%)`).join('\n');
          break;

        case 'url-slug-generator':
          res = (inputs.text || '').toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)+/g, '');
          break;

        case 'open-graph-generator':
          res = `<meta property="og:title" content="${inputs.title || ''}">\n<meta property="og:description" content="${inputs.desc || ''}">\n<meta property="og:image" content="${inputs.img || ''}">\n<meta property="og:url" content="${inputs.url || ''}">\n<meta property="og:type" content="${inputs.type || 'website'}">\n<meta property="og:site_name" content="${inputs.site || ''}">`;
          break;

        case 'seo-title-generator':
          const t = inputs.topic || 'Keyword';
          res = `1. The Ultimate Guide to ${t} in 2026\n2. 10 Best ${t} Strategies You Need to Know\n3. How to Master ${t} for Better Results\n4. ${t}: Everything You Need to Know (Expert Guide)\n5. Top 7 Secrets About ${t} Revealed\n6. Why ${t} is Important for Your Business\n7. Step-by-Step Tutorial: Mastering ${t}\n8. ${t} Checklist for Beginners`;
          break;

        case 'seo-description-generator':
          const kw = inputs.topic || 'Keyword';
          res = `Looking for the best information on ${kw}? Discover our comprehensive guide covering top strategies, expert tips, and everything you need to know about ${kw}. Read more now to boost your knowledge!\n\nAlternative:\nMaster ${kw} with our expert tips and tricks. Learn how to optimize your ${kw} strategy for maximum impact and success in 2026.`;
          break;
      }
    } catch (error) {
      res = 'Error generating content. Please check your connection and try again.';
      console.error(error);
    }
    setOutput(res);
    setLoading(false);
  };

  const renderInputs = () => {
    switch (toolId) {
      case 'keyword-research-tool':
        return (
          <div className="fg mb-4">
            <label className="fl">Enter Target Keyword</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
              <input type="text" className="fi pl-10" value={inputs.keyword || ''} onChange={e => setInputs({...inputs, keyword: e.target.value})} placeholder="e.g. digital marketing" />
            </div>
          </div>
        );
      case 'backlink-checker':
      case 'domain-authority-checker':
      case 'website-speed-test':
        return (
          <div className="fg mb-4">
            <label className="fl">Enter Website URL</label>
            <div className="relative">
              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
              <input type="url" className="fi pl-10" value={inputs.url || ''} onChange={e => setInputs({...inputs, url: e.target.value})} placeholder="https://example.com" />
            </div>
          </div>
        );
      case 'plagiarism-checker':
        return (
          <div className="fg mb-4">
            <label className="fl">Enter Content to Check</label>
            <textarea className="fta min-h-[200px]" value={inputs.text || ''} onChange={e => setInputs({...inputs, text: e.target.value})} placeholder="Paste your article or text here..." />
          </div>
        );
      case 'meta-tag-generator':
        return (
          <>
            <div className="fg mb-4"><label className="fl">Site Title</label><input type="text" className="fi" value={inputs.title || ''} onChange={e => setInputs({...inputs, title: e.target.value})} /></div>
            <div className="fg mb-4"><label className="fl">Site Description</label><textarea className="fta min-h-[80px]" value={inputs.desc || ''} onChange={e => setInputs({...inputs, desc: e.target.value})} /></div>
            <div className="fg mb-4"><label className="fl">Keywords (comma separated)</label><input type="text" className="fi" value={inputs.keys || ''} onChange={e => setInputs({...inputs, keys: e.target.value})} /></div>
            <div className="fg mb-4"><label className="fl">Author Name</label><input type="text" className="fi" value={inputs.author || ''} onChange={e => setInputs({...inputs, author: e.target.value})} /></div>
            <div className="fg mb-4"><label className="fl">Site URL</label><input type="url" className="fi" value={inputs.url || ''} onChange={e => setInputs({...inputs, url: e.target.value})} /></div>
            <div className="fg mb-4"><label className="fl">OG Image URL</label><input type="url" className="fi" value={inputs.img || ''} onChange={e => setInputs({...inputs, img: e.target.value})} /></div>
          </>
        );
      case 'robots-txt-generator':
        return (
          <>
            <div className="fg mb-4"><label className="fl">Disallow Path</label><input type="text" className="fi" value={inputs.disallow || ''} onChange={e => setInputs({...inputs, disallow: e.target.value})} placeholder="/private/" /></div>
            <div className="fg mb-4"><label className="fl">Sitemap URL</label><input type="url" className="fi" value={inputs.sitemap || ''} onChange={e => setInputs({...inputs, sitemap: e.target.value})} placeholder="https://example.com/sitemap.xml" /></div>
          </>
        );
      case 'url-slug-generator':
        return (
          <div className="fg mb-4"><label className="fl">Enter Text to Slugify</label><input type="text" className="fi" value={inputs.text || ''} onChange={e => setInputs({...inputs, text: e.target.value})} placeholder="My Awesome Blog Post Title!" /></div>
        );
      case 'open-graph-generator':
        return (
          <>
            <div className="fg mb-4"><label className="fl">OG Title</label><input type="text" className="fi" value={inputs.title || ''} onChange={e => setInputs({...inputs, title: e.target.value})} /></div>
            <div className="fg mb-4"><label className="fl">OG Description</label><textarea className="fta min-h-[80px]" value={inputs.desc || ''} onChange={e => setInputs({...inputs, desc: e.target.value})} /></div>
            <div className="fg mb-4"><label className="fl">OG Image URL</label><input type="url" className="fi" value={inputs.img || ''} onChange={e => setInputs({...inputs, img: e.target.value})} /></div>
            <div className="fg mb-4"><label className="fl">OG URL</label><input type="url" className="fi" value={inputs.url || ''} onChange={e => setInputs({...inputs, url: e.target.value})} /></div>
            <div className="fg mb-4"><label className="fl">OG Type</label><select className="fi" value={inputs.type || 'website'} onChange={e => setInputs({...inputs, type: e.target.value})}>
              <option value="website">Website</option>
              <option value="article">Article</option>
              <option value="profile">Profile</option>
              <option value="book">Book</option>
            </select></div>
          </>
        );
      case 'keyword-density-checker':
        return (
          <div className="fg mb-4"><label className="fl">Enter Content</label><textarea className="fta min-h-[200px]" value={inputs.text || ''} onChange={e => setInputs({...inputs, text: e.target.value})} /></div>
        );
      case 'seo-title-generator':
      case 'seo-description-generator':
        return (
          <div className="fg mb-4"><label className="fl">Main Keyword / Topic</label><input type="text" className="fi" value={inputs.topic || ''} onChange={e => setInputs({...inputs, topic: e.target.value})} placeholder="e.g. Digital Marketing" /></div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="fg">
          <div className="bg-surface border border-border rounded-[14px] p-6 shadow-sm">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Zap className="w-5 h-5 text-accent" /> Tool Configuration
            </h3>
            
            {renderInputs()}

            <button 
              onClick={generate} 
              disabled={loading}
              className="btn bp w-full mt-4 gap-2 h-12 text-lg"
            >
              {loading ? (
                <RefreshCw className="w-5 h-5 animate-spin" />
              ) : (
                <BarChart3 className="w-5 h-5" />
              )}
              {loading ? 'Analyzing...' : 'Generate Analysis'}
            </button>
          </div>
        </div>

        <div className="fg">
          <div className="bg-surface border border-border rounded-[14px] p-6 shadow-sm h-full flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <FileText className="w-5 h-5 text-accent" /> Analysis Result
              </h3>
              <button 
                onClick={handleCopy} 
                disabled={!output || loading} 
                className="p-2 text-text-muted hover:text-text-primary hover:bg-bg-secondary rounded-lg transition-colors disabled:opacity-50"
              >
                {copied ? <Check className="w-5 h-5 text-success" /> : <Copy className="w-5 h-5" />}
              </button>
            </div>
            <div className="flex-1 relative">
              <textarea 
                className="fta h-full min-h-[400px] bg-bg-secondary font-mono text-sm leading-relaxed p-4 rounded-xl border-none focus:ring-0 resize-none" 
                value={output} 
                readOnly 
                placeholder={loading ? "AI is analyzing your request..." : "Result will appear here..."} 
              />
              {loading && (
                <div className="absolute inset-0 bg-bg-secondary/50 backdrop-blur-[2px] flex items-center justify-center rounded-xl">
                  <div className="flex flex-col items-center gap-3">
                    <RefreshCw className="w-8 h-8 text-accent animate-spin" />
                    <p className="text-sm font-medium text-text-primary">Processing with AI...</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

