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

    const recent = JSON.parse(localStorage.getItem('recent-tools') || '[]');
    setRecentToolIds(recent);

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
        title="LoveyouTools - Free Online Professional Multi-Tools Hub" 
        description="LoveyouTools is a free online platform offering 100+ professional tools for image editing, PDF conversion, SEO analysis, and more with zero signup."
        url={window.location.href}
      />
      {/* Hero Section */}
      <section className="text-center pt-2 pb-4 relative overflow-hidden mb-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,var(--color-accent)_0%,transparent_40%)] opacity-5 pointer-events-none"></div>
        
        <h1 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl xl:text-[2.4rem] 2xl:text-[2.6rem] font-extrabold tracking-tight text-text-primary mt-0 mb-6 w-full mx-auto leading-tight sm:whitespace-nowrap">
          Professional Online Tools Designed to Simplify Your Digital Tasks
        </h1>

        <div className="flex flex-wrap justify-center gap-6 text-sm font-medium text-text-muted">
          <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-success" /> 100+ Tools</div>
          <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-success" /> 8 Categories</div>
          <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-success" /> No Signup Required</div>
          <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-success" /> 100% Free Forever</div>
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
      <section className="bg-surface border border-border rounded-[14px] p-8 md:p-12 mt-16 max-w-5xl mx-auto text-center prose prose-lg dark:prose-invert">
        <h2 className="text-3xl font-extrabold mb-6">Why LoveyouTools is the #1 Digital Utility Platform</h2>
        <p>LoveyouTools offers users around the globe unparalleled access to over 100+ fully-functional digital utilities absolutely free. Unlike traditional web services, the majority of our tools operate strictly on the client side—which means your processing happens directly in your browser without ever communicating with external servers. This leads to exceptional data privacy, no internet lag, and blistering fast processing times.</p>
        <p>Whether you need to manipulate a PDF, compress high-resolution images, generate web-ready icons, format code, or quickly perform an SEO structure analysis, we have the precise tool tailored for your needs. We are constantly expanding our library of utilities to ensure you never have to sign up for expensive software suites again.</p>
      </section>
      
      <AdSlot adSlot="home-bottom-section" className="mt-12" />
    </div>
  );
}
