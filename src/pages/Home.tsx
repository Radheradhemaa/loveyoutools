import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { categories, tools } from '../data/tools';
import { ArrowRight, Sparkles, Zap, Shield, CheckCircle2, History } from 'lucide-react';
import SEO from '../components/SEO';

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
    <div className="max-w-[1380px] mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-12">
      <SEO 
        title="LoveyouTools - Professional Multi-Tools Hub" 
        description="A fully functional, professional, and production-ready multi-tools hub. Free online tools for images, PDFs, SEO, and more with real-time previews."
        url={window.location.href}
      />
      {/* Hero Section */}
      <section className="text-center py-4 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,var(--color-accent)_0%,transparent_40%)] opacity-5 pointer-events-none"></div>
        
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent/10 text-accent font-medium text-sm mb-4">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-accent"></span>
          </span>
          New AI Tools Added
        </div>

        <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-text-primary mb-4 max-w-4xl mx-auto leading-tight">
          LoveyouTools: Professional Tools to Simplify Your Digital Tasks.
        </h1>

        <div className="flex flex-wrap justify-center gap-6 text-sm font-medium text-text-muted mb-4">
          <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-success" /> 80+ Tools</div>
          <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-success" /> 9 Categories</div>
          <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-success" /> 0 Signup Required</div>
          <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-success" /> 100% Free</div>
        </div>
      </section>

      {/* Recently Used Section */}
      {recentTools.length > 0 && (
        <section className="mb-24">
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
        <section id="trending-section" className="mb-24 scroll-mt-24">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <Sparkles className="text-accent" /> {activeCategory === 'all' ? 'Trending Tools' : `Popular ${activeCategoryName} Tools`}
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

      {/* All Tools Grid */}
      <section id="tools-grid" className="scroll-mt-24">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Zap className="text-accent" /> Browse All Tools
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

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
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
    </div>
  );
}
