import { Link } from 'react-router-dom';
import { HelpCircle, CheckCircle2, Zap, Shield, Smartphone, ArrowRight } from 'lucide-react';
import AdSlot from './AdSlot';

interface ToolSeoContentProps {
  tool: { id: string; n: string; d: string; c: string };
  categoryName?: string;
  relatedTools: Array<{ id: string; n: string }>;
}

export default function ToolSeoContent({ tool, categoryName, relatedTools }: ToolSeoContentProps) {
  return (
    <div className="mt-14 space-y-10">
      <AdSlot adSlot="seo-top-slot" />

      {/* About the Tool Section */}
      <section className="bg-surface border border-border rounded-2xl p-6 sm:p-8 shadow-sm">
        <h2 className="text-2xl font-bold text-text-primary mb-3">About {tool.n}</h2>
        <p className="text-text-secondary leading-relaxed mb-4">
          {tool.d}
        </p>
        <p className="text-text-secondary leading-relaxed">
          At LoveYouTools, our utilities are engineered to run directly in your web browser using modern Web APIs. This guarantees fast performance, eliminates waiting queues, and keeps your private data secure on your local device.
        </p>
      </section>

      {/* How to Use Section */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-text-primary">How to Use {tool.n}</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="bg-surface border border-border rounded-2xl p-6 shadow-sm">
            <div className="w-9 h-9 rounded-xl bg-accent/10 text-accent font-bold flex items-center justify-center mb-4 text-sm">
              01
            </div>
            <h3 className="font-bold text-text-primary mb-1.5">Provide Input</h3>
            <p className="text-text-secondary text-sm leading-relaxed">
              Upload your file, paste your text, or enter values into the workspace above.
            </p>
          </div>

          <div className="bg-surface border border-border rounded-2xl p-6 shadow-sm">
            <div className="w-9 h-9 rounded-xl bg-accent/10 text-accent font-bold flex items-center justify-center mb-4 text-sm">
              02
            </div>
            <h3 className="font-bold text-text-primary mb-1.5">Configure Options</h3>
            <p className="text-text-secondary text-sm leading-relaxed">
              Select your desired settings, adjustments, or formatting choices with instant feedback.
            </p>
          </div>

          <div className="bg-surface border border-border rounded-2xl p-6 shadow-sm">
            <div className="w-9 h-9 rounded-xl bg-accent/10 text-accent font-bold flex items-center justify-center mb-4 text-sm">
              03
            </div>
            <h3 className="font-bold text-text-primary mb-1.5">Save Output</h3>
            <p className="text-text-secondary text-sm leading-relaxed">
              Copy the resulting values or download your processed file immediately with zero wait time.
            </p>
          </div>
        </div>
      </section>

      {/* Key Advantages */}
      <section className="bg-surface border border-border rounded-2xl p-6 sm:p-8 shadow-sm">
        <h2 className="text-2xl font-bold text-text-primary mb-6">Why Choose LoveYouTools?</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="flex gap-4 items-start">
            <div className="p-2 rounded-xl bg-accent/10 text-accent shrink-0 mt-0.5">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-text-primary mb-1">Instant Client-Side Speed</h3>
              <p className="text-text-secondary text-sm leading-relaxed">
                Computations happen directly on your machine's hardware using modern JavaScript and WebAssembly.
              </p>
            </div>
          </div>

          <div className="flex gap-4 items-start">
            <div className="p-2 rounded-xl bg-accent/10 text-accent shrink-0 mt-0.5">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-text-primary mb-1">Strict Privacy by Design</h3>
              <p className="text-text-secondary text-sm leading-relaxed">
                Files and sensitive text inputs remain inside your local browser memory and are never uploaded to remote storage.
              </p>
            </div>
          </div>

          <div className="flex gap-4 items-start">
            <div className="p-2 rounded-xl bg-accent/10 text-accent shrink-0 mt-0.5">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-text-primary mb-1">Zero Sign-Up Required</h3>
              <p className="text-text-secondary text-sm leading-relaxed">
                Access every tool immediately without creating an account, confirming emails, or providing payment info.
              </p>
            </div>
          </div>

          <div className="flex gap-4 items-start">
            <div className="p-2 rounded-xl bg-accent/10 text-accent shrink-0 mt-0.5">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-text-primary mb-1">Mobile & Desktop Ready</h3>
              <p className="text-text-secondary text-sm leading-relaxed">
                Responsive layouts designed specifically for mobile touchscreens, tablets, laptops, and ultra-wide displays.
              </p>
            </div>
          </div>
        </div>
      </section>

      <AdSlot adSlot="seo-middle-slot" />

      {/* Internal Linking / Related Tools */}
      {relatedTools.length > 0 && (
        <section className="bg-bg-secondary border border-border rounded-2xl p-6 sm:p-8">
          <h2 className="text-xl font-bold text-text-primary mb-2">Related {categoryName} Utilities</h2>
          <p className="text-sm text-text-secondary mb-4">
            Discover other fast, privacy-focused online tools in the {categoryName} category:
          </p>
          <div className="flex flex-wrap gap-2.5">
            {relatedTools.map(rt => (
              <Link
                key={rt.id}
                to={`/${rt.id}`}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-surface border border-border hover:border-accent hover:text-accent rounded-full text-xs font-semibold text-text-primary transition-all shadow-xs"
              >
                <span>{rt.n}</span>
                <ArrowRight className="w-3 h-3 opacity-60" />
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* FAQ Section */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-text-primary flex items-center gap-2">
          <HelpCircle className="w-6 h-6 text-accent" /> Frequently Asked Questions
        </h2>
        <div className="space-y-3">
          <div className="bg-surface border border-border rounded-2xl p-5 shadow-sm">
            <h3 className="font-bold text-base text-text-primary mb-1.5">Is {tool.n} completely free to use?</h3>
            <p className="text-text-secondary text-sm leading-relaxed">
              Yes, all features of {tool.n} are 100% free with no subscription, daily limits, or hidden fees.
            </p>
          </div>

          <div className="bg-surface border border-border rounded-2xl p-5 shadow-sm">
            <h3 className="font-bold text-base text-text-primary mb-1.5">Are my files or inputs stored on your server?</h3>
            <p className="text-text-secondary text-sm leading-relaxed">
              No. For this and the majority of our tools, data is processed locally in your browser memory. We never store, log, or sell your personal files.
            </p>
          </div>

          <div className="bg-surface border border-border rounded-2xl p-5 shadow-sm">
            <h3 className="font-bold text-base text-text-primary mb-1.5">Can I use this tool on my smartphone?</h3>
            <p className="text-text-secondary text-sm leading-relaxed">
              Yes, LoveYouTools is fully responsive and optimized for touch interactions on iOS, iPadOS, and Android devices.
            </p>
          </div>
        </div>
      </section>

      <AdSlot adSlot="seo-bottom-slot" />
    </div>
  );
}

