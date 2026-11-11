import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { categories, tools } from '../data/tools';
import { ArrowRight, Sparkles, Zap, Shield, CheckCircle2, History } from 'lucide-react';
import SEO from '../components/SEO';
import AdSlot from '../components/AdSlot';

export default function Home() {
  const [searchParams, setSearchParams] = useSearchParams();
  const categoryParam = searchParams.get('c') || 'all';
  const [activeCategory, setActiveCategory] = useState(categoryParam);
  const [recentToolIds, setRecentToolIds] = useState<string[]>([]);

  const scrollToContent = () => {
    const trendingEl = document.getElementById('trending-section');
    const gridEl = document.getElementById('tools-grid');
    const target = trendingEl || gridEl;
    if (target) target.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    setActiveCategory(categoryParam);
    if (categoryParam !== 'all') {
      setTimeout(scrollToContent, 100);
    }
  }, [categoryParam]);

  useEffect(() => {
    const handleFilter = (e: CustomEvent) => {
      setActiveCategory(e.detail);
      setSearchParams({ c: e.detail });
      setTimeout(scrollToContent, 10);
    };
    window.addEventListener('filter-category', handleFilter as EventListener);

    try {
      const recent = JSON.parse(localStorage.getItem('recent-tools') || '[]');
      if (Array.isArray(recent)) {
        setRecentToolIds(recent);
      } else {
        setRecentToolIds([]);
      }
    } catch (e) {
      console.error("Error parsing recent tools", e);
      setRecentToolIds([]);
    }

    return () => window.removeEventListener('filter-category', handleFilter as EventListener);
  }, [setSearchParams]);

  const handleCategoryChange = (catId: string) => {
    setActiveCategory(catId);
    setSearchParams({ c: catId });
    setTimeout(scrollToContent, 10);
  };

  const filteredTools = activeCategory === 'all' 
    ? tools 
    : tools.filter(t => t.c === activeCategory);

  const trendingTools = activeCategory === 'all'
    ? tools.filter(t => (t as any).popular).slice(0, 8)
    : tools.filter(t => t.c === activeCategory && (t as any).popular).slice(0, 4);

  const activeCategoryName = categories.find(c => c.id === activeCategory)?.name || 'All';

  const recentTools = recentToolIds
    .map(id => tools.find(t => t.id === id))
    .filter(Boolean) as typeof tools;

  return (
    <div className="max-w-[1380px] mx-auto px-4 sm:px-6 lg:px-8 pt-2 pb-12">
      <SEO 
        title="LoveYouTools – Free Online Tools Hub | Love You Tools (100+ Free Web Tools)" 
        description="LoveYouTools (Love You Tools) is India's leading 100% free online utility suite with 100+ browser-based tools for PDF editing, background removal, passport photos, resume maker, AI text humanizer, and calculators with zero signup."
        keywords="LoveYouTools, love you tools, love you, loveyoutools in, love you online tools, free online tools, background remover, passport photo maker, pdf editor, resume maker, ai text humanizer, compress pdf, image compressor, age calculator"
        url="https://loveyoutools.in/"
        schema={[
          {
            "@context": "https://schema.org",
            "@type": "WebSite",
            "@id": "https://loveyoutools.in/#website",
            "url": "https://loveyoutools.in/",
            "name": "LoveYouTools",
            "alternateName": ["Love You Tools", "Love You", "LoveYouTools.in", "loveyoutools", "Love You Online Tools", "loveyou tools"],
            "potentialAction": {
              "@type": "SearchAction",
              "target": "https://loveyoutools.in/?search={search_term_string}",
              "query-input": "required name=search_term_string"
            }
          },
          {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            "mainEntity": [
              {
                "@type": "Question",
                "name": "What is LoveYouTools (Love You Tools)?",
                "acceptedAnswer": {
                  "@type": "Answer",
                  "text": "LoveYouTools (Love You Tools) is a free online platform offering 100+ digital utilities for image editing, PDF conversion, background removal, passport photo generation, resume building, AI text humanizing, calculations, and web development with zero signup."
                }
              },
              {
                "@type": "Question",
                "name": "Is LoveYouTools 100% free to use?",
                "acceptedAnswer": {
                  "@type": "Answer",
                  "text": "Yes, LoveYouTools is 100% free forever with no hidden subscriptions, no usage limits, and no credit card required."
                }
              },
              {
                "@type": "Question",
                "name": "Is my data private and secure on LoveYouTools?",
                "acceptedAnswer": {
                  "@type": "Answer",
                  "text": "Yes, LoveYouTools executes processing client-side in your browser via modern WebAssembly and HTML5 Canvas. Your images, documents, and files never leave your device."
                }
              },
              {
                "@type": "Question",
                "name": "What popular tools are available on LoveYouTools?",
                "acceptedAnswer": {
                  "@type": "Answer",
                  "text": "Popular tools include AI Background Remover, Passport Photo Maker, PDF Editor, Compress PDF, Resume Maker, AI Text Humanizer, Photo Sign Resizer, Image Compressor, and Age Calculator."
                }
              }
            ]
          }
        ]}
      />
      {/* Hero Section */}
      <section className="text-center pt-2 pb-4 relative overflow-hidden mb-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,var(--color-accent)_0%,transparent_40%)] opacity-5 pointer-events-none"></div>
        
        <h1 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl xl:text-[2.4rem] 2xl:text-[2.6rem] font-extrabold tracking-tight text-text-primary mt-0 mb-3 w-full mx-auto leading-tight">
          <span className="text-accent">LoveYouTools</span> – Free Online Tools Hub (Love You Tools)
        </h1>
        <p className="text-sm sm:text-base text-text-secondary max-w-3xl mx-auto mb-6">
          Welcome to <strong>LoveYouTools (Love You Tools)</strong> — 100+ free online digital tools designed to simplify your everyday tasks. Edit PDFs, remove image backgrounds, format text, build ATS resumes, and calculate anything directly in your browser with 100% privacy and zero sign-up.
        </p>

        <div className="flex flex-wrap justify-center gap-6 text-sm font-medium text-text-muted">
          <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-success" /> 100+ Free Tools</div>
          <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-success" /> 8 Utility Categories</div>
          <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-success" /> Zero Signup Required</div>
          <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-success" /> 100% Client-Side Privacy</div>
        </div>
      </section>

      <AdSlot adSlot="home-top-section" />

      {/* Recently Used Section */}
      {recentTools.length > 0 && (
        <section className="mb-24 mt-12">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <History className="text-accent" /> Recently Used
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {recentTools.map((tool) => (
              <Link 
                key={tool.id} 
                to={`/${tool.id}`}
                className="group bg-surface border border-border rounded-[14px] p-6 hover:-translate-y-1 hover:shadow-md transition-all relative overflow-hidden"
              >
                <div className="absolute top-0 left-0 w-full h-1 bg-accent scale-x-0 group-hover:scale-x-100 transition-transform origin-left"></div>
                <div className="flex items-start justify-between mb-4">
                  <span className="text-4xl">{tool.i}</span>
                </div>
                <h3 className="font-bold text-lg mb-2 group-hover:text-accent transition-colors">{tool.n}</h3>
                <p className="text-text-secondary text-sm line-clamp-2">{tool.d}</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Trending Section */}
      {trendingTools.length > 0 && (
        <section id="trending-section" className="mb-24 scroll-mt-24 mt-12">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <Sparkles className="text-accent" /> {activeCategory === 'all' ? 'Trending SEO & Utility Tools' : `Popular ${activeCategoryName} Tools`}
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {trendingTools.map((tool, idx) => (
            <Link 
              key={tool.id} 
              to={`/${tool.id}`}
              className="group bg-surface border border-border rounded-[14px] p-6 hover:-translate-y-1 hover:shadow-md transition-all relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-accent scale-x-0 group-hover:scale-x-100 transition-transform origin-left"></div>
              <div className="flex items-start justify-between mb-4">
                <span className="text-4xl">{tool.i}</span>
                <span className="text-text-muted font-mono text-sm">#{idx + 1}</span>
              </div>
              <h3 className="font-bold text-lg mb-2 group-hover:text-accent transition-colors">{tool.n}</h3>
              <p className="text-text-secondary text-sm line-clamp-2">{tool.d}</p>
            </Link>
          ))}
        </div>
      </section>
      )}

      <AdSlot adSlot="home-middle-section" />

      {/* All Tools Grid */}
      <section id="tools-grid" className="scroll-mt-24 mt-12">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Zap className="text-accent" /> Browse All Online Tools
          </h2>
          <div className="flex gap-2 overflow-x-auto pb-2 sm:pb-0 w-full sm:w-auto hide-scrollbar">
            {categories.map(cat => (
              <Link
                key={cat.id}
                to={`/?c=${cat.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  handleCategoryChange(cat.id);
                }}
                className={`whitespace-nowrap px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  activeCategory === cat.id 
                    ? 'bg-accent text-white' 
                    : 'bg-bg-secondary text-text-secondary hover:bg-border'
                }`}
              >
                {cat.name}
              </Link>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mb-16">
          {filteredTools.map(tool => (
            <Link 
              key={tool.id} 
              to={`/${tool.id}`}
              className="group bg-surface border border-border rounded-[14px] p-5 hover:-translate-y-1 hover:shadow-md transition-all flex items-center gap-4 relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-[2px] bg-accent scale-x-0 group-hover:scale-x-100 transition-transform origin-left"></div>
              <div 
                className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0"
                style={{ backgroundColor: tool.b }}
              >
                {tool.i}
              </div>
              <div>
                <h3 className="font-bold text-base group-hover:text-accent transition-colors leading-tight mb-1">{tool.n}</h3>
                <p className="text-text-muted text-xs line-clamp-1">{tool.d}</p>
              </div>
            </Link>
          ))}
        </div>
        
        {filteredTools.length === 0 && (
          <div className="text-center py-20 text-text-muted">
            No tools found for this category.
          </div>
        )}
      </section>

      {/* SEO Content Block for Homepage */}
      <section className="bg-surface border border-border rounded-[14px] p-8 md:p-12 mt-16 max-w-5xl mx-auto prose prose-lg dark:prose-invert">
        <h2 className="text-3xl font-extrabold mb-6 text-center">Why LoveYouTools (Love You Tools) is the #1 Free Digital Utility Hub</h2>
        <p><strong>LoveYouTools (Love You Tools)</strong> offers users around the globe unparalleled access to over 100+ fully-functional digital utilities completely free of charge. Unlike traditional cloud services that upload your personal files to external servers, the vast majority of our tools operate strictly on the client side inside your web browser using HTML5 Canvas and WebAssembly. This delivers unmatched data security, complete confidentiality, zero latency, and blazing fast processing speeds.</p>
        <p>Whether you are searching Google for <em>"love you tools"</em>, <em>"love you"</em>, <em>"loveyoutools"</em>, or specific utilities like background removal, PDF merging, resume building, AI text humanizing, or image resizing, <strong>LoveYouTools.in</strong> provides instant, free solutions without demanding software downloads, subscriptions, or intrusive account registrations.</p>
        
        <div className="not-prose mt-10 grid grid-cols-1 md:grid-cols-2 gap-6 text-left">
          <div className="bg-background/60 border border-border p-5 rounded-xl">
            <h3 className="font-bold text-base text-text-primary mb-2 flex items-center gap-2">
              <span className="text-accent text-lg">🔒</span> 100% Client-Side Privacy
            </h3>
            <p className="text-text-muted text-sm leading-relaxed">
              Your photos, confidential PDF contracts, resumes, and personal documents never leave your browser. All computations happen locally on your computer or smartphone.
            </p>
          </div>
          <div className="bg-background/60 border border-border p-5 rounded-xl">
            <h3 className="font-bold text-base text-text-primary mb-2 flex items-center gap-2">
              <span className="text-accent text-lg">⚡</span> Blazing Fast Performance
            </h3>
            <p className="text-text-muted text-sm leading-relaxed">
              Zero server queue delays and zero upload/download wait times. Process multi-megabyte images and documents in milliseconds.
            </p>
          </div>
          <div className="bg-background/60 border border-border p-5 rounded-xl">
            <h3 className="font-bold text-base text-text-primary mb-2 flex items-center gap-2">
              <span className="text-accent text-lg">🆓</span> 100% Free With Zero Signup
            </h3>
            <p className="text-text-muted text-sm leading-relaxed">
              Every tool on LoveYouTools is permanently free with no daily limits, no hidden watermarks, and no sign-up forms required.
            </p>
          </div>
          <div className="bg-background/60 border border-border p-5 rounded-xl">
            <h3 className="font-bold text-base text-text-primary mb-2 flex items-center gap-2">
              <span className="text-accent text-lg">📱</span> Cross-Device & Mobile PWA
            </h3>
            <p className="text-text-muted text-sm leading-relaxed">
              Works seamlessly across all modern browsers — Chrome, Safari, Firefox, and Edge on Android, iOS, Windows, and Mac. Installable as a Progressive Web App.
            </p>
          </div>
        </div>

        {/* Frequently Asked Questions */}
        <div className="not-prose mt-12 border-t border-border pt-8 text-left">
          <h3 className="text-2xl font-bold text-text-primary mb-6 text-center">Frequently Asked Questions (FAQ)</h3>
          <div className="space-y-4">
            <div className="bg-background/80 border border-border rounded-xl p-5">
              <h4 className="font-semibold text-text-primary text-base mb-1">What is LoveYouTools (Love You Tools)?</h4>
              <p className="text-text-muted text-sm">LoveYouTools (Love You Tools) is an all-in-one free digital utility platform featuring 100+ browser-based tools for image editing, PDF management, resume building, AI humanizing, calculations, and web development with zero signup.</p>
            </div>
            <div className="bg-background/80 border border-border rounded-xl p-5">
              <h4 className="font-semibold text-text-primary text-base mb-1">Is LoveYouTools 100% free forever?</h4>
              <p className="text-text-muted text-sm">Yes, all 100+ utilities on LoveYouTools are 100% free with no hidden charges, no watermark on output files, and no subscription fees.</p>
            </div>
            <div className="bg-background/80 border border-border rounded-xl p-5">
              <h4 className="font-semibold text-text-primary text-base mb-1">How can I find LoveYouTools on Google?</h4>
              <p className="text-text-muted text-sm">You can search for "LoveYouTools", "Love You Tools", "Love You Tools in", or specific tools like "Love You background remover" or "Love You resume maker" to reach our official website at https://loveyoutools.in/.</p>
            </div>
            <div className="bg-background/80 border border-border rounded-xl p-5">
              <h4 className="font-semibold text-text-primary text-base mb-1">Is my data safe when using LoveYouTools?</h4>
              <p className="text-text-muted text-sm">Absolutely. Your files and photos are processed directly in your device's browser memory and are never uploaded to any cloud database or server.</p>
            </div>
          </div>
        </div>
      </section>
      
      <AdSlot adSlot="home-bottom-section" className="mt-12" />
    </div>
  );
}
