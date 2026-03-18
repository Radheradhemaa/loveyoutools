import { useState, useEffect } from 'react';
import { Link, Outlet, useLocation, useSearchParams } from 'react-router-dom';
import { Search, Moon, Sun, Menu, X, ChevronRight } from 'lucide-react';
import { categories, tools } from '../data/tools';
import SEO from './SEO';
import { useFocusMode } from '../contexts/FocusModeContext';

export default function Layout() {
  const [isDark, setIsDark] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const activeCategory = searchParams.get('c') || 'all';
  const { isFocusMode } = useFocusMode();

  useEffect(() => {
    const savedTheme = localStorage.getItem('lyt-dk');
    if (savedTheme === 'true' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      setIsDark(true);
      document.documentElement.classList.add('dark');
    }
  }, []);

  const toggleTheme = () => {
    setIsDark(!isDark);
    document.documentElement.classList.toggle('dark');
    localStorage.setItem('lyt-dk', (!isDark).toString());
  };

  const filteredTools = tools.filter(t => 
    t.n.toLowerCase().includes(searchQuery.toLowerCase()) || 
    t.d.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className={`min-h-screen flex flex-col transition-all duration-500 ${isFocusMode ? 'bg-bg-primary' : ''}`}>
      <SEO 
        title="LoveTools - Free Online Tools Hub" 
        description="Free Online Tools to Simplify Your Digital Tasks – Fast, Smart & Reliable."
        url={typeof window !== 'undefined' ? window.location.href : ''}
        schema={{
          "@context": "https://schema.org",
          "@type": "Organization",
          "name": "LoveTools",
          "url": "https://lovetools.io/",
          "logo": "https://lovetools.io/logo.png",
          "sameAs": [
            "https://twitter.com/lovetools",
            "https://github.com/lovetools"
          ]
        }}
      />
      
      {/* Header */}
      {!isFocusMode && (
        <header className="sticky top-0 z-[70] bg-white/90 dark:bg-surface/80 backdrop-blur-md border-b border-border shadow-sm">
          <div className="max-w-[1380px] mx-auto px-4 sm:px-6 lg:px-8 h-16 sm:h-20 flex items-center justify-between gap-4 md:gap-8">
            <Link to="/" className="flex items-center gap-2 group shrink-0" onClick={() => setSearchQuery('')}>
              <div className="relative flex items-center">
                <img 
                  src="/logo.png" 
                  alt="LoveTools - Free Online Tools Platform" 
                  title="LoveTools - Free Online Tools Platform"
                  width="240"
                  height="60"
                  loading="eager"
                  decoding="async"
                  className="logo"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                    const fallback = target.parentElement?.querySelector('.logo-fallback');
                    if (fallback) fallback.classList.remove('hidden');
                  }}
                />
                <span className="logo-fallback hidden font-black text-2xl sm:text-3xl tracking-tighter text-accent">
                  Love<span className="text-text-primary">Tools</span>
                </span>
              </div>
            </Link>

            <div className="flex-1 max-w-xl relative hidden md:block">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted w-5 h-5" />
                <input
                  type="text"
                  placeholder="Search 80+ tools..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-bg-secondary/50 hover:bg-bg-secondary border border-border rounded-full py-2.5 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:bg-surface transition-all shadow-sm"
                />
              </div>
              {searchQuery && (
                <div className="absolute top-full mt-2 w-full bg-surface border border-border rounded-xl shadow-lg overflow-hidden max-h-96 overflow-y-auto">
                  {filteredTools.length > 0 ? (
                    filteredTools.map(tool => (
                      <Link
                        key={tool.id}
                        to={`/${tool.id}`}
                        onClick={() => setSearchQuery('')}
                        className="flex items-center gap-3 p-3 hover:bg-bg-secondary transition-colors border-b border-border last:border-0"
                      >
                        <span className="text-2xl">{tool.i}</span>
                        <div>
                          <div className="font-semibold text-text-primary">{tool.n}</div>
                          <div className="text-xs text-text-muted">{tool.d}</div>
                        </div>
                      </Link>
                    ))
                  ) : (
                    <div className="p-4 text-center text-text-muted">No tools found.</div>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center gap-4 sm:gap-6 shrink-0">
              <Link to="/blog" className="text-sm font-medium text-text-secondary hover:text-accent transition-colors hidden sm:block">
                Blog
              </Link>
              <div className="flex items-center gap-2">
                <button
                  onClick={toggleTheme}
                  className="p-2 rounded-full hover:bg-bg-secondary text-text-secondary transition-colors"
                  aria-label="Toggle Dark Mode"
                >
                  {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                </button>
                <button
                  className="md:hidden p-2 rounded-full hover:bg-bg-secondary text-text-secondary transition-colors"
                  onClick={() => setIsMenuOpen(!isMenuOpen)}
                >
                  {isMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                </button>
              </div>
            </div>
          </div>
        </header>
      )}

      {/* Mobile Menu */}
      {!isFocusMode && isMenuOpen && (
        <div className="md:hidden fixed inset-0 z-[60] bg-surface pt-24 px-4 pb-6 overflow-y-auto">
          <div className="flex flex-col gap-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted w-5 h-5" />
              <input
                type="text"
                placeholder="Search 80+ tools..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-bg-secondary/50 border border-border rounded-xl py-3 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:bg-surface transition-all shadow-sm"
              />
            </div>
            <nav className="flex flex-col gap-4">
              <Link to="/" onClick={() => setIsMenuOpen(false)} className="text-lg font-bold p-2 hover:bg-bg-secondary rounded-lg">Home</Link>
              <Link to="/blog" onClick={() => setIsMenuOpen(false)} className="text-lg font-bold p-2 hover:bg-bg-secondary rounded-lg">Blog</Link>
              <Link to="/about" onClick={() => setIsMenuOpen(false)} className="text-lg font-bold p-2 hover:bg-bg-secondary rounded-lg">About Us</Link>
              <Link to="/contact" onClick={() => setIsMenuOpen(false)} className="text-lg font-bold p-2 hover:bg-bg-secondary rounded-lg">Contact</Link>
            </nav>
            <div className="pt-6 border-t border-border">
              <h3 className="font-bold text-text-muted uppercase tracking-widest text-xs mb-4">Categories</h3>
              <div className="grid grid-cols-2 gap-2">
                {categories.map(cat => (
                  <Link 
                    key={cat.id} 
                    to={`/?c=${cat.id}`} 
                    onClick={(e) => {
                      setIsMenuOpen(false);
                      if (location.pathname === '/') {
                        e.preventDefault();
                        const target = document.getElementById('trending-section') || document.getElementById('tools-grid');
                        if (target) target.scrollIntoView({ behavior: 'smooth' });
                        window.dispatchEvent(new CustomEvent('filter-category', { detail: cat.id }));
                      }
                    }}
                    className="p-2 text-sm bg-bg-secondary rounded-lg hover:bg-accent hover:text-white transition-colors"
                  >
                    {cat.name}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Category Nav - Only show on home page */}
      {!isFocusMode && location.pathname === '/' && (
        <nav className="bg-surface border-b border-border overflow-x-auto hide-scrollbar">
          <div className="max-w-[1380px] mx-auto px-4 sm:px-6 lg:px-8 flex items-center gap-2 sm:gap-3 py-2.5">
            {categories.map(cat => (
              <Link
                key={cat.id}
                to={`/?c=${cat.id}`}
                onClick={(e) => {
                  if (location.pathname === '/') {
                    e.preventDefault();
                    const target = document.getElementById('trending-section') || document.getElementById('tools-grid');
                    if (target) target.scrollIntoView({ behavior: 'smooth' });
                    window.dispatchEvent(new CustomEvent('filter-category', { detail: cat.id }));
                  }
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
        </nav>
      )}

      {/* Main Content */}
      <main className={`flex-1 ${isFocusMode ? 'flex flex-col' : ''}`}>
        <Outlet />
      </main>

      {/* Footer */}
      {!isFocusMode && (
        <footer className="bg-surface border-t border-border mt-20">
          <div className="max-w-[1380px] mx-auto px-4 sm:px-6 lg:px-8 py-12">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
              <div>
                <Link to="/" className="flex items-center mb-6" onClick={() => setSearchQuery('')}>
                  <div className="relative flex items-center">
                    <img 
                      src="/logo.png" 
                      alt="LoveTools - Free Online Tools Platform" 
                      title="LoveTools - Free Online Tools Platform"
                      width="240"
                      height="60"
                      loading="lazy"
                      decoding="async"
                      className="logo mb-4"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                        const fallback = target.parentElement?.querySelector('.logo-fallback-footer');
                        if (fallback) fallback.classList.remove('hidden');
                      }}
                    />
                    <span className="logo-fallback-footer hidden font-black text-3xl tracking-tighter text-accent">
                      Love<span className="text-text-primary">Tools</span>
                    </span>
                  </div>
                </Link>
                <p className="text-text-muted text-sm mb-4">
                  Free Online Tools to Simplify Your Digital Tasks – Fast, Smart & Reliable. No signup required.
                </p>
              </div>
              <div>
                <h3 className="font-bold text-text-primary mb-4">Popular Tools</h3>
                <ul className="space-y-2 text-sm text-text-secondary">
                  <li><Link to="/image-compressor" className="hover:text-accent">Image Compressor</Link></li>
                  <li><Link to="/merge-pdf" className="hover:text-accent">Merge PDF</Link></li>
                  <li><Link to="/word-counter" className="hover:text-accent">Word Counter</Link></li>
                  <li><Link to="/json-formatter-validator" className="hover:text-accent">JSON Formatter</Link></li>
                </ul>
              </div>
              <div>
                <h3 className="font-bold text-text-primary mb-4">Categories</h3>
                <ul className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm text-text-secondary">
                  {categories.filter(c => c.id !== 'all').map(cat => (
                    <li key={cat.id}>
                      <Link 
                        to={`/?c=${cat.id}`} 
                        onClick={(e) => {
                          if (location.pathname === '/') {
                            e.preventDefault();
                            const target = document.getElementById('trending-section') || document.getElementById('tools-grid');
                            if (target) target.scrollIntoView({ behavior: 'smooth' });
                            window.dispatchEvent(new CustomEvent('filter-category', { detail: cat.id }));
                          }
                        }}
                        className="hover:text-accent transition-colors"
                      >
                        {cat.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="font-bold text-text-primary mb-4">Company</h3>
                <ul className="space-y-2 text-sm text-text-secondary">
                  <li><Link to="/about" className="hover:text-accent transition-colors">About Us</Link></li>
                  <li><Link to="/contact" className="hover:text-accent transition-colors">Contact</Link></li>
                  <li><Link to="/blog" className="hover:text-accent transition-colors">Blog</Link></li>
                  <li><Link to="/privacy" className="hover:text-accent transition-colors">Privacy Policy</Link></li>
                  <li><Link to="/terms" className="hover:text-accent transition-colors">Terms of Service</Link></li>
                </ul>
              </div>
            </div>
            <div className="border-t border-border mt-12 pt-8 flex flex-col md:flex-row items-center justify-between text-sm text-text-muted">
              <p>&copy; {new Date().getFullYear()} LoveTools. All rights reserved.</p>
              <div className="flex gap-4 mt-4 md:mt-0">
                <span>Made with love for the web</span>
              </div>
            </div>
          </div>
        </footer>
      )}
    </div>
  );
}
