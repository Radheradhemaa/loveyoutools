import { Link } from 'react-router-dom';
import { HelpCircle, CheckCircle2, Zap, Shield, FileText, Settings, Laptop, FileEdit, FileSearch, Trash2, BookOpen, Star, RefreshCw } from 'lucide-react';
import AdSlot from '../AdSlot';

interface ToolSeoContentProps {
  tool: { id: string; n: string; d: string; c: string };
  categoryName?: string;
  relatedTools: Array<{ id: string; n: string }>;
}

export default function PdfEditorSeo({ tool, categoryName, relatedTools }: ToolSeoContentProps) {
  const currentYear = new Date().getFullYear();

  return (
    <div className="mt-12 space-y-12">
      <AdSlot adSlot="seo-top-slot" />

      {/* Hero / Introduction */}
      <section className="prose prose-lg dark:prose-invert max-w-none text-text-secondary">
        <h2 className="text-3xl font-extrabold text-text-primary mb-6">Free Online PDF Editor Without Watermark</h2>
        <p>
          Welcome to the ultimate solution to <strong>edit PDF text online free with no signup</strong>. Have you ever urgently needed to correct a typo in a contract, update a resume, or fill out a form, only to be blocked by an expensive software paywall or a mandatory watermark? Look no further. Our browser-based <strong>free online PDF editor</strong> gives you absolute freedom to modify your documents instantly. 
        </p>
        <p>
          Whether you are a professional preparing a report, a student correcting an assignment, or a small business owner handling invoices, our PDF editing tool is built for you. We provide a fully featured, highly secure, and intuitive platform that requires zero installation. By using advanced browser technologies, we ensure that your files are processed directly on your device, guaranteeing absolute privacy and blazing-fast performance.
        </p>
      </section>

      {/* How it Works / Step by step */}
      <section className="bg-surface border border-border rounded-[24px] p-8 shadow-sm">
        <h2 className="text-2xl font-bold text-text-primary mb-6">How to Edit PDF Text Online Free</h2>
        <p className="text-text-secondary mb-8">
          Editing a PDF should not require a computer science degree. Here is our simple step-by-step usage guide to get your document modified in seconds.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="flex flex-col gap-3">
            <div className="w-12 h-12 rounded-full bg-blue-500/10 text-blue-600 flex items-center justify-center font-bold text-xl">1</div>
            <h3 className="font-bold text-text-primary">Upload Your PDF</h3>
            <p className="text-sm text-text-secondary">Drag and drop your PDF file into the designated upload area or click to select a file from your device. Large files are supported instantly.</p>
          </div>
          <div className="flex flex-col gap-3">
            <div className="w-12 h-12 rounded-full bg-blue-500/10 text-blue-600 flex items-center justify-center font-bold text-xl">2</div>
            <h3 className="font-bold text-text-primary">Select the Text Tool</h3>
            <p className="text-sm text-text-secondary">Click on the 'Text' editing tool from the toolbar. This allows you to interact directly with the existing text inside your document.</p>
          </div>
          <div className="flex flex-col gap-3">
            <div className="w-12 h-12 rounded-full bg-blue-500/10 text-blue-600 flex items-center justify-center font-bold text-xl">3</div>
            <h3 className="font-bold text-text-primary">Edit Text Directly</h3>
            <p className="text-sm text-text-secondary">Click on any text block on the page. Our tool will automatically detect the font size, color, and weight. Type your changes naturally.</p>
          </div>
          <div className="flex flex-col gap-3">
            <div className="w-12 h-12 rounded-full bg-blue-500/10 text-blue-600 flex items-center justify-center font-bold text-xl">4</div>
            <h3 className="font-bold text-text-primary">Export & Save</h3>
            <p className="text-sm text-text-secondary">Once you are satisfied with the changes, click the 'Download PDF' button. Your updated, watermark-free PDF will download instantly.</p>
          </div>
        </div>
      </section>

      <AdSlot adSlot="seo-middle-slot" />

      {/* Key Features */}
      <section className="prose prose-lg dark:prose-invert max-w-none text-text-secondary">
        <h2 className="text-3xl font-bold text-text-primary mb-6">Key Features of Our PDF Editor</h2>
        <p>Unlike basic annotation tools that only let you place text boxes on top of your document, our <strong>seamless PDF editor</strong> actually allows you to manipulate the source text. Here is what makes our tool stand out in {currentYear}:</p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 not-prose mt-8">
          <div className="flex gap-4 p-6 bg-bg-secondary rounded-[16px] border border-border">
            <div className="shrink-0 text-accent"><FileEdit className="w-8 h-8" /></div>
            <div>
              <h3 className="font-bold text-lg text-text-primary mb-2">True Text Replacement</h3>
              <p className="text-sm text-text-secondary">We don't just mask your text. We perfectly white-out the original text while preserving the background, matching the exact baseline, font weights, and spacing for a completely natural edit.</p>
            </div>
          </div>
          
          <div className="flex gap-4 p-6 bg-bg-secondary rounded-[16px] border border-border">
            <div className="shrink-0 text-success"><CheckCircle2 className="w-8 h-8" /></div>
            <div>
              <h3 className="font-bold text-lg text-text-primary mb-2">No Watermarks, Forever</h3>
              <p className="text-sm text-text-secondary">Many "free" tools force a large watermark on your final document. We guarantee a <strong>free online PDF editor without watermark</strong>—what you see is what you get.</p>
            </div>
          </div>

          <div className="flex gap-4 p-6 bg-bg-secondary rounded-[16px] border border-border">
            <div className="shrink-0 text-purple-500"><Shield className="w-8 h-8" /></div>
            <div>
              <h3 className="font-bold text-lg text-text-primary mb-2">100% Client-Side Privacy</h3>
              <p className="text-sm text-text-secondary">Your sensitive documents never touch our servers. Using WebAssembly and PDF.js, we execute all processing directly in your browser. Security and privacy are guaranteed.</p>
            </div>
          </div>

          <div className="flex gap-4 p-6 bg-bg-secondary rounded-[16px] border border-border">
            <div className="shrink-0 text-amber-500"><Settings className="w-8 h-8" /></div>
            <div>
              <h3 className="font-bold text-lg text-text-primary mb-2">Match Existing Fonts</h3>
              <p className="text-sm text-text-secondary">Our advanced engine automatically tries to detect whether the original text is bold, italic, serif, or sans-serif, and applies appropriate styles to your modified text.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="bg-gradient-to-br from-blue-50/50 to-purple-50/50 dark:from-blue-900/10 dark:to-purple-900/10 border border-border rounded-[24px] p-8 lg:p-12">
        <div className="max-w-3xl">
          <h2 className="text-3xl font-bold text-text-primary mb-6">Why Choose LoveYouTools For PDF Editing?</h2>
          <p className="text-lg text-text-secondary mb-8">
            The internet is flooded with generic PDF modification websites, but most fall short when it comes to user experience and trust. Here is why thousands of users trust LoveYouTools every single day:
          </p>
          <ul className="space-y-4">
            <li className="flex items-start gap-3">
              <CheckCircle2 className="w-6 h-6 text-success shrink-0 mt-0.5" />
              <div>
                <strong className="text-text-primary block">No Registration Required (No Sign Up)</strong>
                <span className="text-text-secondary">We respect your time. You don't need to provide an email address, verify an account, or complete a tedious sign-up process.</span>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <Zap className="w-6 h-6 text-blue-500 shrink-0 mt-0.5" />
              <div>
                <strong className="text-text-primary block">Lightning Fast Performance</strong>
                <span className="text-text-secondary">Because everything happens via your local device's CPU/RAM, there are no slow upload or download times, regardless of your internet connection speed.</span>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <Laptop className="w-6 h-6 text-purple-500 shrink-0 mt-0.5" />
              <div>
                <strong className="text-text-primary block">Cross-Platform Compatibility</strong>
                <span className="text-text-secondary">Works seamlessly on Windows, macOS, Linux, ChromeOS, and modern mobile browsers. If you have a web browser, you have a PDF editor.</span>
              </div>
            </li>
          </ul>
        </div>
      </section>

      <AdSlot adSlot="seo-bottom-slot" />

      {/* Security & Privacy Explanation */}
      <section className="prose prose-lg dark:prose-invert max-w-none text-text-secondary">
        <h2 className="text-2xl font-bold text-text-primary mb-4">Enterprise-Grade Security & Privacy</h2>
        <p>
          When you are editing invoices, legal contracts, or medical records, security cannot be an afterthought. Conventional online PDF editors upload your highly sensitive files to remote cloud servers for processing. This exposes your data to interception, server breaches, and non-compliant retention policies.
        </p>
        <p>
          Our <strong>PDF Text Editor</strong> is fundamentally different. It operates on an <i>"offline-first"</i> web architecture. Once the webpage loads, the actual PDF processing engine (powered by advanced JavaScript and WebAssembly) runs locally on your machine. We do not store your files. We do not analyze your documents. Your data remains strictly within the confines of your own screen.
        </p>
      </section>

      {/* Internal Linking / Related Tools */}
      {relatedTools.length > 0 && (
        <section className="bg-bg-secondary border border-border rounded-[14px] p-6 shadow-sm">
          <h2 className="text-xl font-bold mb-4">Explore More Free PDF Utilities</h2>
          <p className="text-sm text-text-secondary mb-4">Enhance your document workflow further with our suite of {categoryName} tools:</p>
          <div className="flex flex-wrap gap-3">
            {relatedTools.map(rt => (
              <Link key={rt.id} to={`/${rt.id}`} className="px-5 py-2.5 bg-surface border border-border hover:border-accent hover:text-accent rounded-full text-sm font-medium transition-colors shadow-sm">
                {rt.n}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* FAQs */}
      <section>
        <h2 className="text-3xl font-bold mb-8 flex items-center gap-3 text-text-primary">
          <HelpCircle className="text-accent w-8 h-8" /> Frequently Asked Questions
        </h2>
        <div className="grid gap-4">
          <div className="bg-surface border border-border rounded-[16px] p-6 shadow-sm hover:border-accent/30 transition-colors">
            <h3 className="font-bold text-lg mb-2 text-text-primary">1. How can I edit PDF text online for free without a watermark?</h3>
            <p className="text-text-secondary">Simply upload your document to our editor, click the text you wish to modify, delete or type your new content, and click export. We guarantee that zero watermarks will be added to your final downloaded file.</p>
          </div>
          <div className="bg-surface border border-border rounded-[16px] p-6 shadow-sm hover:border-accent/30 transition-colors">
            <h3 className="font-bold text-lg mb-2 text-text-primary">2. Will anyone else be able to see my uploaded PDF?</h3>
            <p className="text-text-secondary">No. Your PDF file is processed entirely inside your web browser. No data is sent to our servers, ensuring your sensitive information remains 100% private and secure.</p>
          </div>
          <div className="bg-surface border border-border rounded-[16px] p-6 shadow-sm hover:border-accent/30 transition-colors">
            <h3 className="font-bold text-lg mb-2 text-text-primary">3. Does this tool preserve the original formatting?</h3>
            <p className="text-text-secondary">Yes. Our engine attempts to match the original font family, size, exact color, and weight. We seamlessly 'white out' the old text and place the new text in the exact same baseline coordinate.</p>
          </div>
          <div className="bg-surface border border-border rounded-[16px] p-6 shadow-sm hover:border-accent/30 transition-colors">
            <h3 className="font-bold text-lg mb-2 text-text-primary">4. Do I need to sign up or create an account?</h3>
            <p className="text-text-secondary">Not at all. You can edit your PDF text online for free with absolutely no signup, no credit card, and no email registration required.</p>
          </div>
          <div className="bg-surface border border-border rounded-[16px] p-6 shadow-sm hover:border-accent/30 transition-colors">
            <h3 className="font-bold text-lg mb-2 text-text-primary">5. Can I edit scanned PDFs?</h3>
            <p className="text-text-secondary">This tool is designed for true digital PDFs (documents containing actual text data). If your PDF is purely a scanned image, you will not be able to edit the text directly, though you can still add new text boxes or whiteout areas.</p>
          </div>
          <div className="bg-surface border border-border rounded-[16px] p-6 shadow-sm hover:border-accent/30 transition-colors">
            <h3 className="font-bold text-lg mb-2 text-text-primary">6. What devices are supported?</h3>
            <p className="text-text-secondary">Our platform is optimized for all devices. You can use it on a Windows PC, Mac, Linux machine, as well as on iOS and Android devices, as long as you use a modern web browser.</p>
          </div>
          <div className="bg-surface border border-border rounded-[16px] p-6 shadow-sm hover:border-accent/30 transition-colors">
            <h3 className="font-bold text-lg mb-2 text-text-primary">7. How many pages can this tool handle?</h3>
            <p className="text-text-secondary">The limit is largely dependent on your device's memory (RAM) since the processing is local. Most users comfortably edit documents spanning dozens to hundreds of pages without issue.</p>
          </div>
          <div className="bg-surface border border-border rounded-[16px] p-6 shadow-sm hover:border-accent/30 transition-colors">
            <h3 className="font-bold text-lg mb-2 text-text-primary">8. Can I add images to my PDF?</h3>
            <p className="text-text-secondary">Currently, this tool specializes in text editing. However, we offer dedicated tools within the LoveYouTools suite specifically designed for adding or extracting images from PDFs.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
