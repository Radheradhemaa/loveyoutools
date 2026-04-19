import { Link } from 'react-router-dom';
import { HelpCircle, CheckCircle2, Zap, Shield, ThumbsUp, Star } from 'lucide-react';
import AdSlot from './AdSlot';

interface ToolSeoContentProps {
  tool: { id: string; n: string; d: string; c: string };
  categoryName?: string;
  relatedTools: Array<{ id: string; n: string }>;
}

export default function ToolSeoContent({ tool, categoryName, relatedTools }: ToolSeoContentProps) {
  // Generate dynamic, elongated SEO content based on the tool.
  // This aims to provide 800+ words of keyword-rich content required for optimal AdSense ranking.
  
  const currentYear = new Date().getFullYear();

  return (
    <div className="mt-16 space-y-12">
      <AdSlot adSlot="seo-top-slot" />

      {/* Overview Section (SEO Boost) */}
      <section className="prose prose-lg dark:prose-invert max-w-none">
        <h2 className="text-3xl font-extrabold mb-6">The Ultimate {tool.n} Guide for {currentYear}</h2>
        <p>
          Welcome to the most comprehensive and free online <strong>{tool.n}</strong> available today. Whether you are a professional, a student, or simply someone looking to streamline your digital workflow, our {tool.n} is designed precisely to meet your needs. In this digital age, having reliable {categoryName?.toLowerCase() || 'utility'} tools is more important than ever. We built this <strong>100% free tool</strong> because we believe that essential digital utilities should be accessible to everyone without paywalls, hidden fees, or intrusive subscriptions.
        </p>
        <p>
          Unlike other platforms, our {tool.n} performs its core functions efficiently while maintaining the highest standards of data privacy. All operations are highly optimized so that you spend less time configuring and more time getting results. With {tool.n}, you can expect speed, reliability, and precision right from your browser.
        </p>
      </section>

      {/* How to Use Section */}
      <section>
        <h2 className="text-2xl font-bold mb-6">How to Use {tool.n} (Step-by-Step)</h2>
        <p className="text-text-secondary mb-6">
          Using our {tool.n} is incredibly straightforward. Follow these simple steps to get the best results:
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-surface border border-border rounded-[14px] p-6 shadow-sm">
            <div className="w-8 h-8 rounded-full bg-accent/10 text-accent flex items-center justify-center font-bold mb-4">1</div>
            <h3 className="font-bold mb-2">Step 1: Input Your Data</h3>
            <p className="text-text-secondary text-sm">Upload your required files, paste your text, or provide the necessary inputs in the workspace above. Our interface accepts standard compatible formats securely.</p>
          </div>
          <div className="bg-surface border border-border rounded-[14px] p-6 shadow-sm">
            <div className="w-8 h-8 rounded-full bg-accent/10 text-accent flex items-center justify-center font-bold mb-4">2</div>
            <h3 className="font-bold mb-2">Step 2: Configure Settings</h3>
            <p className="text-text-secondary text-sm">Adjust any specific options or preferences. You have full control over how {tool.n} processes your data to ensure it meets your exact requirements.</p>
          </div>
          <div className="bg-surface border border-border rounded-[14px] p-6 shadow-sm">
            <div className="w-8 h-8 rounded-full bg-accent/10 text-accent flex items-center justify-center font-bold mb-4">3</div>
            <h3 className="font-bold mb-2">Step 3: Process & Download</h3>
            <p className="text-text-secondary text-sm">Click the processing button. Your data is handled instantly. Once completed, you can copy, save, or download the output immediately with zero wait time.</p>
          </div>
        </div>
      </section>

      <AdSlot adSlot="seo-middle-slot" />

      {/* Features List Section */}
      <section className="bg-surface border border-border rounded-[14px] p-8">
        <h2 className="text-2xl font-bold mb-6">Key Features of {tool.n}</h2>
        <p className="text-text-secondary mb-6">We have packed {tool.n} with industry-leading features to give you the best experience possible.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="flex gap-4">
            <div className="mt-1 text-accent"><Zap className="w-6 h-6" /></div>
            <div>
              <h3 className="font-bold mb-1">Blazing Fast Execution</h3>
              <p className="text-text-secondary text-sm">Leveraging modern browser technologies, {tool.n} works at lightning speeds, removing server-side lag.</p>
            </div>
          </div>
          <div className="flex gap-4">
            <div className="mt-1 text-accent"><Shield className="w-6 h-6" /></div>
            <div>
              <h3 className="font-bold mb-1">Uncompromised Privacy</h3>
              <p className="text-text-secondary text-sm">Security is our top priority. For the majority of operations, your data never leaves your device and is not saved on any database.</p>
            </div>
          </div>
          <div className="flex gap-4">
            <div className="mt-1 text-accent"><CheckCircle2 className="w-6 h-6" /></div>
            <div>
              <h3 className="font-bold mb-1">100% Free to Use</h3>
              <p className="text-text-secondary text-sm">No credit cards, no login, and no restricted features. {tool.n} is fully unlocked for all users globally.</p>
            </div>
          </div>
          <div className="flex gap-4">
            <div className="mt-1 text-accent"><Star className="w-6 h-6" /></div>
            <div>
              <h3 className="font-bold mb-1">Mobile Friendly</h3>
              <p className="text-text-secondary text-sm">Whether you are on a desktop, tablet, or smartphone, our tool scales perfectly to fit your screen size.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Use Cases Section */}
      <section className="prose prose-lg dark:prose-invert max-w-none">
        <h2 className="text-2xl font-bold mb-4">Top Use Cases for {tool.n}</h2>
        <p>Understanding when to use {tool.n} can vastly improve your daily digital routine. Here is how millions of users leverage this utility:</p>
        <ul>
          <li><strong>Professional Workflows:</strong> Streamline your office tasks. If you work in marketing, tech, or administration, {tool.n} is an indispensable part of preparing outputs for presentations and reports.</li>
          <li><strong>Academic Projects:</strong> Students and educators rely on {tool.n} to quickly format, process, or verify information needed for assignments.</li>
          <li><strong>Digital Content Creation:</strong> Social media managers and creators use our utilities to ensure their digital assets are optimized perfectly before publishing.</li>
          <li><strong>Everyday Utilities:</strong> Sometimes you just need a quick fix. {tool.n} is built for rapid, on-the-go adjustments without the hassle of downloading heavy desktop applications.</li>
        </ul>
      </section>

      <AdSlot adSlot="seo-bottom-slot" />

      {/* Internal Linking / Related Tools */}
      {relatedTools.length > 0 && (
        <section className="bg-bg-secondary border border-border rounded-[14px] p-6 shadow-sm">
          <h2 className="text-xl font-bold mb-4">Explore More {categoryName} Tools</h2>
          <p className="text-sm text-text-secondary mb-4">Don't stop at {tool.n}. We have an entire suite of related utilities designed to work hand-in-hand with your workflow:</p>
          <div className="flex flex-wrap gap-3">
            {relatedTools.map(rt => (
              <Link key={rt.id} to={`/${rt.id}`} className="px-4 py-2 bg-surface border border-border hover:border-accent hover:text-accent rounded-full text-sm font-medium transition-colors">
                {rt.n}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* FAQ Section */}
      <section>
        <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
          <HelpCircle className="text-accent" /> Frequently Asked Questions (FAQs)
        </h2>
        <div className="space-y-4">
          <div className="bg-surface border border-border rounded-[14px] p-6 shadow-sm">
            <h3 className="font-bold text-lg mb-2">1. Do I need to create an account to use {tool.n}?</h3>
            <p className="text-text-secondary">No, you do not need to register, sign up, or provide an email address. {tool.n} is ready to use instantly.</p>
          </div>
          <div className="bg-surface border border-border rounded-[14px] p-6 shadow-sm">
            <h3 className="font-bold text-lg mb-2">2. Is it safe to process confidential data with {tool.n}?</h3>
            <p className="text-text-secondary">Yes. Our tools prioritize client-side processing, ensuring that for supported tools, your data stays within your browser cache and is never uploaded to external servers.</p>
          </div>
          <div className="bg-surface border border-border rounded-[14px] p-6 shadow-sm">
            <h3 className="font-bold text-lg mb-2">3. Are there any hidden limits?</h3>
            <p className="text-text-secondary">LoveyouTools believes in a free internet. While browser memory may limit extreme file sizes, there are no artificial paywall limits imposed by us.</p>
          </div>
          <div className="bg-surface border border-border rounded-[14px] p-6 shadow-sm">
            <h3 className="font-bold text-lg mb-2">4. Can I use this on my mobile phone?</h3>
            <p className="text-text-secondary">Absolutely! The {tool.n} interface is fully responsive, meaning it works beautifully on Android, iOS, tablets, and desktop computers.</p>
          </div>
          <div className="bg-surface border border-border rounded-[14px] p-6 shadow-sm">
            <h3 className="font-bold text-lg mb-2">5. Why is this tool provided for free?</h3>
            <p className="text-text-secondary">We monetize the site via safe, non-intrusive advertisements (like Google AdSense). This helps us pay for the domains, hosting, and development time while keeping the tool itself free for everyone.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
