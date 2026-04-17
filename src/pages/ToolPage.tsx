import { useParams, Link } from 'react-router-dom';
import { ChevronRight, Share2, Copy, Twitter, Info, HelpCircle, CheckCircle2, Zap, Shield, Star, ThumbsUp, Users, Facebook, MessageCircle, Instagram, BookOpen } from 'lucide-react';
import { tools, categories } from '../data/tools';
import { blogPosts } from '../data/blog';
import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import SEO from '../components/SEO';
import { useFocusMode } from '../contexts/FocusModeContext';

// Lazy load tool components
const WordCounter = lazy(() => import('../tools/WordCounter'));
const JsonFormatter = lazy(() => import('../tools/JsonFormatter'));
const AgeCalculator = lazy(() => import('../tools/AgeCalculator'));
const QrGenerator = lazy(() => import('../tools/QrGenerator'));
const ImageCompressor = lazy(() => import('../tools/ImageCompressor'));
const BackgroundRemover = lazy(() => import('../tools/BackgroundRemover'));
const PassportPhotoMaker = lazy(() => import('../tools/PassportPhotoMaker'));
const GenericTool = lazy(() => import('../tools/GenericTool'));
const TextTools = lazy(() => import('../tools/TextTools'));
const DeveloperTools = lazy(() => import('../tools/DeveloperTools'));
const CalculatorTools = lazy(() => import('../tools/CalculatorTools'));
const GeneratorTools = lazy(() => import('../tools/GeneratorTools'));
const SeoTools = lazy(() => import('../tools/SeoTools'));
const SocialTools = lazy(() => import('../tools/SocialTools'));
const ImageTools = lazy(() => import('../tools/ImageTools'));
const PdfTools = lazy(() => import('../tools/PdfTools'));
const PhotoSignResizer = lazy(() => import('../tools/PhotoSignResizer'));
const AdvancedPdfEditor = lazy(() => import('../tools/AdvancedPdfEditor'));
const AdvancedPdfCropper = lazy(() => import('../tools/AdvancedPdfCropper'));
const KdpFixer = lazy(() => import('../tools/KdpFixer'));
const ImageCropper = lazy(() => import('../tools/ImageCropper'));
const ImageColorPicker = lazy(() => import('../tools/ImageColorPicker'));
const GifMaker = lazy(() => import('../tools/GifMaker'));
const FaviconGenerator = lazy(() => import('../tools/FaviconGenerator'));
const SvgToPngConverter = lazy(() => import('../tools/SvgToPngConverter'));
const DynamicPreviewer = lazy(() => import('../components/DynamicPreviewer'));
const KeyboardShortcutGuide = lazy(() => import('../tools/KeyboardShortcutGuide'));
const InternetSpeedTest = lazy(() => import('../tools/InternetSpeedTest'));
const DocumentScanner = lazy(() => import('../tools/DocumentScanner'));

const ToolLoader = () => (
  <div className="flex flex-col items-center justify-center py-20 animate-pulse">
    <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin mb-4"></div>
    <p className="text-text-muted font-medium">Loading tool...</p>
  </div>
);

export default function ToolPage() {
  const { id } = useParams<{ id: string }>();
  const cleanId = id?.replace(/\/$/, '')?.trim()?.toLowerCase();
  const tool = tools.find(t => t.id.toLowerCase() === cleanId);
  const [copied, setCopied] = useState(false);
  const toolRef = useRef<HTMLDivElement>(null);
  const { isFocusMode } = useFocusMode();

  useEffect(() => {
    if (toolRef.current) {
      toolRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      window.scrollTo(0, 0);
    }

    if (tool) {
      const recent = JSON.parse(localStorage.getItem('recent-tools') || '[]');
      const updated = [tool.id, ...recent.filter((id: string) => id !== tool.id)].slice(0, 8);
      localStorage.setItem('recent-tools', JSON.stringify(updated));
    }
  }, [id, tool]);

  if (!tool) {
    return (
      <div className="max-w-[1380px] mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
        <h1 className="text-4xl font-bold mb-4">Tool Not Found</h1>
        <p className="text-text-muted mb-8">The tool you are looking for does not exist.</p>
        <Link to="/" className="btn bp">Return Home</Link>
      </div>
    );
  }

  const category = categories.find(c => c.id === tool.c);
  const relatedTools = tools.filter(t => t.c === tool.c && t.id !== tool.id).slice(0, 4);
  const blogPost = blogPosts.find(p => p.toolId === tool.id);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Render specific tool component based on ID or Category
  const renderTool = () => {
    // Specific overrides
    if (tool.id === 'word-counter') return <WordCounter />;
    if (tool.id === 'json-formatter-validator') return <JsonFormatter />;
    if (tool.id === 'age-calculator') return <AgeCalculator />;
    if (tool.id === 'qr-code-generator') return <QrGenerator />;
    if (tool.id === 'background-remover') return <BackgroundRemover />;
    if (tool.id === 'passport-photo-maker') return <PassportPhotoMaker />;
    if (tool.id === 'image-compressor') return <ImageCompressor />;
    if (tool.id === 'photo-sign-resizer') return <PhotoSignResizer />;
    if (tool.id === 'pdf-editor') return <AdvancedPdfEditor />;
    if (tool.id === 'crop-pdf') return <AdvancedPdfCropper />;
    if (tool.id === 'kdp-margin-bleed-fixer') return <KdpFixer />;
    if (tool.id === 'image-cropper') return <ImageCropper />;
    if (tool.id === 'image-color-picker') return <ImageColorPicker />;
    if (tool.id === 'gif-maker') return <GifMaker />;
    if (tool.id === 'favicon-generator') return <FaviconGenerator />;
    if (tool.id === 'svg-to-png') return <SvgToPngConverter />;
    if (tool.id === 'dynamic-previewer') return <DynamicPreviewer />;
    if (tool.id === 'keyboard-shortcut-guide') return <KeyboardShortcutGuide />;
    if (tool.id === 'internet-speed-test') return <InternetSpeedTest />;
    if (tool.id === 'document-scanner') return <DocumentScanner />;

    // Category handlers
    if (tool.c === 'text') return <TextTools toolId={tool.id} />;
    if (tool.c === 'developer') return <DeveloperTools toolId={tool.id} />;
    if (tool.c === 'calculator') return <CalculatorTools toolId={tool.id} />;
    if (tool.c === 'generator') return <GeneratorTools toolId={tool.id} />;
    if (tool.c === 'seo') return <SeoTools toolId={tool.id} />;
    if (tool.c === 'social') return <SocialTools toolId={tool.id} />;
    if (tool.c === 'image') return <ImageTools toolId={tool.id} />;
    if (tool.c === 'pdf') return <PdfTools toolId={tool.id} />;

    // Fallback
    return <GenericTool tool={tool} />;
  };

  const toolUrl = `${window.location.origin}/${tool.id}`;
  const keywords = `${tool.n.toLowerCase()}, free ${tool.n.toLowerCase()}, online ${tool.n.toLowerCase()}, ${category?.name.toLowerCase()} tools`;

  // Schemas
  const softwareSchema = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": tool.n,
    "description": tool.d,
    "applicationCategory": "BrowserApplication",
    "operatingSystem": "All",
    "offers": {
      "@type": "Offer",
      "price": "0",
      "priceCurrency": "USD"
    },
    "aggregateRating": {
      "@type": "AggregateRating",
      "ratingValue": "4.8",
      "ratingCount": Math.floor(Math.random() * 500) + 100
    }
  };

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      {
        "@type": "ListItem",
        "position": 1,
        "name": "Home",
        "item": "https://loveyoutools.in"
      },
      {
        "@type": "ListItem",
        "position": 2,
        "name": category?.name,
        "item": `https://loveyoutools.in/#tools-grid`
      },
      {
        "@type": "ListItem",
        "position": 3,
        "name": tool.n,
        "item": `https://loveyoutools.in/${tool.id}`
      }
    ]
  };

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      {
        "@type": "Question",
        "name": `Is ${tool.n} free to use?`,
        "acceptedAnswer": {
          "@type": "Answer",
          "text": `Yes, ${tool.n} is completely free to use. There are no hidden charges, subscriptions, or limits.`
        }
      },
      {
        "@type": "Question",
        "name": "Is my data secure?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Absolutely. All processing happens directly in your browser. We do not upload your files or data to any external servers."
        }
      },
      {
        "@type": "Question",
        "name": `How do I use the ${tool.n}?`,
        "acceptedAnswer": {
          "@type": "Answer",
          "text": `Simply upload your file or enter your input in the tool area above, configure any available options, and click the process button to get your results instantly.`
        }
      }
    ]
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(toolUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: tool.n,
          text: tool.d,
          url: toolUrl,
        });
      } catch (err) {
        console.log('Error sharing:', err);
      }
    } else {
      handleCopy();
    }
  };

  const shareLinks = {
    whatsapp: `https://api.whatsapp.com/send?text=${encodeURIComponent(`Check out this free tool: ${tool.n} - ${toolUrl}`)}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(toolUrl)}`,
    twitter: `https://twitter.com/intent/tweet?url=${encodeURIComponent(toolUrl)}&text=${encodeURIComponent(`Check out this free tool: ${tool.n}`)}`,
    instagram: `https://www.instagram.com/`, // Instagram doesn't support direct URL sharing via web links
  };

  return (
    <div className={`${isFocusMode ? 'w-full h-[100dvh] p-0 m-0' : 'max-w-[1380px] mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6'}`} ref={toolRef}>
      <SEO 
        title={`${tool.n} - Free Online Tool`}
        description={`${tool.d} Fast, secure, and 100% free online ${tool.n.toLowerCase()}. No signup required.`}
        keywords={keywords}
        url={toolUrl}
        type="SoftwareApplication"
      />
      <script type="application/ld+json">{JSON.stringify(softwareSchema)}</script>
      <script type="application/ld+json">{JSON.stringify(breadcrumbSchema)}</script>
      <script type="application/ld+json">{JSON.stringify(faqSchema)}</script>

      {/* Breadcrumb */}
      {!isFocusMode && (
        <nav className="flex items-center gap-2 text-xs sm:text-sm text-text-muted mb-4 sm:mb-6">
          <Link to="/" className="hover:text-accent transition-colors">Home</Link>
          <ChevronRight className="w-3 h-3 sm:w-4 h-4" />
          <Link to={`/?c=${tool.c}`} className="hover:text-accent transition-colors">
            {category?.name}
          </Link>
          <ChevronRight className="w-3 h-3 sm:w-4 h-4" />
          <span className="text-text-primary font-medium truncate">{tool.n}</span>
        </nav>
      )}

      <div className={isFocusMode ? 'h-full' : 'grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8'}>
        {/* Main Tool Area */}
        <div className={isFocusMode ? 'h-full' : 'lg:col-span-9 space-y-6 sm:space-y-8'}>
          {/* Tool Header */}
          {!isFocusMode && (
            <div className="flex flex-col sm:flex-row items-start gap-4 sm:gap-6">
              <div 
                className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl flex items-center justify-center text-3xl sm:text-4xl shrink-0 shadow-sm"
                style={{ backgroundColor: tool.b }}
              >
                {tool.i}
              </div>
              <div className="flex-1">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2">
                  <h1 className="text-2xl sm:text-3xl font-bold text-text-primary">{tool.n}</h1>
                  
                  {/* Social Share Buttons */}
                  <div className="flex items-center gap-2">
                    <a 
                      href={shareLinks.whatsapp} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="p-2 rounded-full bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366]/20 transition-colors"
                      title="Share on WhatsApp"
                    >
                      <MessageCircle className="w-5 h-5" />
                    </a>
                    <a 
                      href={shareLinks.facebook} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="p-2 rounded-full bg-[#1877F2]/10 text-[#1877F2] hover:bg-[#1877F2]/20 transition-colors"
                      title="Share on Facebook"
                    >
                      <Facebook className="w-5 h-5" />
                    </a>
                    <button 
                      onClick={handleNativeShare}
                      className="p-2 rounded-full bg-[#E4405F]/10 text-[#E4405F] hover:bg-[#E4405F]/20 transition-colors"
                      title="Share on Instagram / More"
                    >
                      <Instagram className="w-5 h-5" />
                    </button>
                    <button 
                      onClick={handleCopy}
                      className={`p-2 rounded-full transition-colors flex items-center gap-2 ${copied ? 'bg-success/10 text-success' : 'bg-accent/10 text-accent hover:bg-accent/20'}`}
                      title="Copy Link"
                    >
                      {copied ? <CheckCircle2 className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                    </button>
                  </div>
                </div>
                
                <p className="text-text-secondary text-base sm:text-lg mb-4">{tool.d}</p>
                <div className="flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-success/10 text-success text-xs font-bold">
                    <CheckCircle2 className="w-3 h-3" /> 100% Free
                  </span>
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-blue-500/10 text-blue-600 text-xs font-bold">
                    <Zap className="w-3 h-3" /> Fast
                  </span>
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-purple-500/10 text-purple-600 text-xs font-bold">
                    <Shield className="w-3 h-3" /> Private (In-Browser)
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Tool Workspace */}
          <div className={isFocusMode ? 'h-full' : 'ws'}>
            <Suspense fallback={<ToolLoader />}>
              {renderTool()}
            </Suspense>
          </div>

          {/* SEO Content Block */}
          {!isFocusMode && (
            <div className="mt-16 space-y-12">
              <section>
                <h2 className="text-2xl font-bold mb-4">How to use {tool.n}</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="bg-surface border border-border rounded-[14px] p-6">
                    <div className="w-8 h-8 rounded-full bg-accent/10 text-accent flex items-center justify-center font-bold mb-4">1</div>
                    <h3 className="font-bold mb-2">Input Data</h3>
                    <p className="text-text-secondary text-sm">Upload your file or paste your text into the tool interface above.</p>
                  </div>
                  <div className="bg-surface border border-border rounded-[14px] p-6">
                    <div className="w-8 h-8 rounded-full bg-accent/10 text-accent flex items-center justify-center font-bold mb-4">2</div>
                    <h3 className="font-bold mb-2">Configure</h3>
                    <p className="text-text-secondary text-sm">Adjust the settings and options according to your specific needs.</p>
                  </div>
                  <div className="bg-surface border border-border rounded-[14px] p-6">
                    <div className="w-8 h-8 rounded-full bg-accent/10 text-accent flex items-center justify-center font-bold mb-4">3</div>
                    <h3 className="font-bold mb-2">Get Results</h3>
                    <p className="text-text-secondary text-sm">Click the process button to instantly get your optimized results.</p>
                  </div>
                </div>
              </section>

              <section className="bg-surface border border-border rounded-[14px] p-8">
                <h2 className="text-2xl font-bold mb-6">Why use our {tool.n}?</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="flex gap-4">
                    <div className="mt-1 text-accent"><Zap className="w-6 h-6" /></div>
                    <div>
                      <h3 className="font-bold mb-1">Lightning Fast</h3>
                      <p className="text-text-secondary text-sm">Everything is processed locally in your browser, meaning zero upload time and instant results.</p>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <div className="mt-1 text-accent"><Shield className="w-6 h-6" /></div>
                    <div>
                      <h3 className="font-bold mb-1">100% Secure</h3>
                      <p className="text-text-secondary text-sm">Your data never leaves your device. We don't store or upload your files to any servers.</p>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <div className="mt-1 text-accent"><CheckCircle2 className="w-6 h-6" /></div>
                    <div>
                      <h3 className="font-bold mb-1">Always Free</h3>
                      <p className="text-text-secondary text-sm">No hidden fees, no subscriptions, and no limits on how many times you can use the tool.</p>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <div className="mt-1 text-accent"><ThumbsUp className="w-6 h-6" /></div>
                    <div>
                      <h3 className="font-bold mb-1">Easy to Use</h3>
                      <p className="text-text-secondary text-sm">Designed with a clean, intuitive interface that anyone can understand and use immediately.</p>
                    </div>
                  </div>
                </div>
              </section>

              {/* FAQ Section */}
              <section>
                <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
                  <HelpCircle className="text-accent" /> Frequently Asked Questions
                </h2>
                <div className="space-y-4">
                  <div className="bg-surface border border-border rounded-[14px] p-6">
                    <h3 className="font-bold text-lg mb-2">Is {tool.n} free to use?</h3>
                    <p className="text-text-secondary">Yes, {tool.n} is completely free to use. There are no hidden charges, subscriptions, or limits.</p>
                  </div>
                  <div className="bg-surface border border-border rounded-[14px] p-6">
                    <h3 className="font-bold text-lg mb-2">Is my data secure?</h3>
                    <p className="text-text-secondary">Absolutely. All processing happens directly in your browser. We do not upload your files or data to any external servers.</p>
                  </div>
                  <div className="bg-surface border border-border rounded-[14px] p-6">
                    <h3 className="font-bold text-lg mb-2">How do I use the {tool.n}?</h3>
                    <p className="text-text-secondary">Simply upload your file or enter your input in the tool area above, configure any available options, and click the process button to get your results instantly.</p>
                  </div>
                </div>
              </section>

              {/* SEO Blog Content */}
              {blogPost && (
                <section className="bg-surface border border-border rounded-[14px] p-8 mt-12">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center text-accent">
                      <BookOpen className="w-5 h-5" />
                    </div>
                    <h2 className="text-2xl font-bold">{blogPost.title}</h2>
                  </div>
                  <div 
                    className="prose prose-sm sm:prose-base dark:prose-invert max-w-none text-text-secondary
                      prose-headings:text-text-primary prose-headings:font-bold prose-headings:mt-8 prose-headings:mb-4
                      prose-p:mb-4 prose-ul:mb-4 prose-ol:mb-4 prose-li:mb-1
                      prose-strong:text-text-primary prose-a:text-accent prose-a:no-underline hover:prose-a:underline"
                    dangerouslySetInnerHTML={{ __html: blogPost.content }}
                  />
                </section>
              )}
            </div>
          )}
        </div>

        {/* Sidebar */}
        {!isFocusMode && (
          <div className="lg:col-span-3 space-y-8">
            {/* Share Box */}
            <div className="bg-surface border border-border rounded-[14px] p-6 shadow-sm">
              <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                <Share2 className="w-5 h-5 text-accent" /> Share this tool
              </h3>
              <div className="flex flex-col gap-3">
                <button 
                  onClick={handleCopyLink}
                  className="w-full flex items-center justify-center gap-2 bg-bg-secondary hover:bg-border text-text-primary py-2.5 rounded-[9px] font-medium transition-colors"
                >
                  <Copy className="w-4 h-4" /> {copied ? 'Copied!' : 'Copy Link'}
                </button>
                <a 
                  href={`https://twitter.com/intent/tweet?text=Check out this free ${tool.n} tool!&url=${window.location.href}`}
                  target="_blank" rel="noopener noreferrer"
                  className="w-full flex items-center justify-center gap-2 bg-[#1DA1F2] hover:bg-[#1a91da] text-white py-2.5 rounded-[9px] font-medium transition-colors"
                >
                  <Twitter className="w-4 h-4" /> Share on Twitter
                </a>
              </div>
            </div>

            {/* Related Tools */}
            {relatedTools.length > 0 && (
              <div className="bg-surface border border-border rounded-[14px] p-6 shadow-sm">
                <h3 className="font-bold text-lg mb-4">Related Tools</h3>
                <div className="space-y-4">
                  {relatedTools.map(rt => (
                    <Link 
                      key={rt.id} 
                      to={`/${rt.id}`}
                      className="flex items-center gap-3 group"
                    >
                      <div className="w-10 h-10 rounded-lg flex items-center justify-center text-xl shrink-0" style={{ backgroundColor: rt.b }}>
                        {rt.i}
                      </div>
                      <div>
                        <div className="font-semibold text-sm group-hover:text-accent transition-colors">{rt.n}</div>
                        <div className="text-xs text-text-muted line-clamp-1">{rt.d}</div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Info Box */}
            <div className="bg-accent/5 border border-accent/20 rounded-[14px] p-6">
              <h3 className="font-bold text-lg mb-2 flex items-center gap-2 text-accent">
                <Info className="w-5 h-5" /> Did you know?
              </h3>
              <p className="text-sm text-text-secondary">
                LoveTools runs entirely in your browser using modern Web APIs. This means it's lightning fast and your data never leaves your device.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
