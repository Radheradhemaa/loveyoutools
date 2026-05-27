import { Link } from 'react-router-dom';
import { HelpCircle, CheckCircle2, Zap, Shield, Image as ImageIcon, Sparkles, Printer, Smartphone } from 'lucide-react';
import AdSlot from '../AdSlot';

interface ToolSeoContentProps {
  tool: { id: string; n: string; d: string; c: string };
  categoryName?: string;
  relatedTools: Array<{ id: string; n: string }>;
}

export default function PassportPhotoMakerSeo({ tool, categoryName, relatedTools }: ToolSeoContentProps) {
  const currentYear = new Date().getFullYear();

  return (
    <div className="mt-12 space-y-12">
      <AdSlot adSlot="seo-top-slot" />

      {/* Hero / Introduction */}
      <section className="prose prose-lg dark:prose-invert max-w-none text-text-secondary">
        <h2 className="text-3xl font-extrabold text-text-primary mb-6">Instant Passport Size Photo Maker</h2>
        <p>
          Welcome to the fastest and most reliable <strong>instant passport size photo maker online</strong>. Skip the trip to the local photo studio and save money by creating professional-grade passport, visa, and ID photos right from your own home. Our advanced AI-powered tool automatically processes your casual photos and transforms them into perfectly sized, compliance-ready passport photos in seconds.
        </p>
        <p>
          Whether you need a standard US 2x2 inch photo, a 35x45mm European/UK standard, or an <strong>instant passport size photo maker India</strong> standard, our tool provides exact dimensions. It features an integrated high-definition AI background remover, ensuring your final image has the mandatory crisp white or blue background required by government and immigration authorities worldwide.
        </p>
      </section>

      {/* How it Works / Step by step */}
      <section className="bg-surface border border-border rounded-[24px] p-8 shadow-sm">
        <h2 className="text-2xl font-bold text-text-primary mb-6">How to Create a Passport Photo Online Free</h2>
        <p className="text-text-secondary mb-8">
          Getting the perfect ID photo has never been easier. No Photoshop skills are required—just follow these four simple steps:
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="flex flex-col gap-3">
            <div className="w-12 h-12 rounded-full bg-blue-500/10 text-blue-600 flex items-center justify-center font-bold text-xl">1</div>
            <h3 className="font-bold text-text-primary">Upload Your Photo</h3>
            <p className="text-sm text-text-secondary">Take a picture against any well-lit wall. Stand straight, look directly at the camera, and keep a neutral expression. Upload the image here.</p>
          </div>
          <div className="flex flex-col gap-3">
            <div className="w-12 h-12 rounded-full bg-blue-500/10 text-blue-600 flex items-center justify-center font-bold text-xl">2</div>
            <h3 className="font-bold text-text-primary">AI Background Removal</h3>
            <p className="text-sm text-text-secondary">Our intelligent engine will automatically detect your face and shoulders, instantly replacing chaotic backgrounds with a solid color of your choice.</p>
          </div>
          <div className="flex flex-col gap-3">
            <div className="w-12 h-12 rounded-full bg-blue-500/10 text-blue-600 flex items-center justify-center font-bold text-xl">3</div>
            <h3 className="font-bold text-text-primary">Adjust Dimensions</h3>
            <p className="text-sm text-text-secondary">Select your target country or custom dimensions (e.g., 3.5cm x 4.5cm). Pan and scale your face so it fits perfectly within the smart cropping guides.</p>
          </div>
          <div className="flex flex-col gap-3">
            <div className="w-12 h-12 rounded-full bg-blue-500/10 text-blue-600 flex items-center justify-center font-bold text-xl">4</div>
            <h3 className="font-bold text-text-primary">Download & Print</h3>
            <p className="text-sm text-text-secondary">Download the single photo as a high-resolution JPG/PNG, or generate an A4 printable collage sheet with multiple photos ready for your home printer.</p>
          </div>
        </div>
      </section>

      <AdSlot adSlot="seo-middle-slot" />

      {/* Key Features */}
      <section className="prose prose-lg dark:prose-invert max-w-none text-text-secondary">
        <h2 className="text-3xl font-bold text-text-primary mb-6">Why Use Our Background Remover & Photo Maker?</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 not-prose mt-8">
          <div className="flex gap-4 p-6 bg-bg-secondary rounded-[16px] border border-border">
            <div className="shrink-0 text-accent"><Sparkles className="w-8 h-8" /></div>
            <div>
              <h3 className="font-bold text-lg text-text-primary mb-2">HD AI Background Removal</h3>
              <p className="text-sm text-text-secondary">Our integrated <strong>background remover online HD free</strong> seamlessly extracts your portrait while preserving fine hair details, ensuring your ID photo looks naturally captured on a studio backdrop.</p>
            </div>
          </div>
          
          <div className="flex gap-4 p-6 bg-bg-secondary rounded-[16px] border border-border">
            <div className="shrink-0 text-success"><CheckCircle2 className="w-8 h-8" /></div>
            <div>
              <h3 className="font-bold text-lg text-text-primary mb-2">Exact Country Specifications</h3>
              <p className="text-sm text-text-secondary">Whether you need a US Visa photo (2x2"), UK Passport (35x45mm), Indian PAN card, or OCI application sizes, we provide exact aspect ratio cropping and DPI scaling.</p>
            </div>
          </div>

          <div className="flex gap-4 p-6 bg-bg-secondary rounded-[16px] border border-border">
            <div className="shrink-0 text-purple-500"><Printer className="w-8 h-8" /></div>
            <div>
              <h3 className="font-bold text-lg text-text-primary mb-2">Print-Ready Collage Sheets</h3>
              <p className="text-sm text-text-secondary">Don't waste expensive photo paper. Automatically tile your generated passport photos onto standard 4x6" or A4 canvas sizes so you can print multiple copies for pennies.</p>
            </div>
          </div>

          <div className="flex gap-4 p-6 bg-bg-secondary rounded-[16px] border border-border">
            <div className="shrink-0 text-amber-500"><Shield className="w-8 h-8" /></div>
            <div>
              <h3 className="font-bold text-lg text-text-primary mb-2">100% Privacy & Security</h3>
              <p className="text-sm text-text-secondary">Your selfies are yours. Photos are processed purely on the client-side within your browser. We never upload your facial data to external servers, protecting your identity completely.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Photography Tips */}
      <section className="bg-gradient-to-br from-indigo-50/50 to-pink-50/50 dark:from-indigo-900/10 dark:to-pink-900/10 border border-border rounded-[24px] p-8 lg:p-12">
        <div className="max-w-3xl">
          <h2 className="text-3xl font-bold text-text-primary mb-6">Pro Tips for a Guaranteed Pass</h2>
          <p className="text-lg text-text-secondary mb-8">
            Even with the best automated tools, the source photo must meet basic immigration guidelines. Ensure your photo passes inspection by following these expert tips:
          </p>
          <ul className="space-y-4">
            <li className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-white dark:bg-black border border-border flex items-center justify-center shrink-0">💡</div>
              <div>
                <strong className="text-text-primary block">Lighting and Shadows</strong>
                <span className="text-text-secondary">Face a window during the daytime to get even, natural lighting across your entire face. Avoid harsh overhead lighting that casts shadows under your eyes or nose.</span>
              </div>
            </li>
            <li className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-white dark:bg-black border border-border flex items-center justify-center shrink-0">😐</div>
              <div>
                <strong className="text-text-primary block">Expression and Posture</strong>
                <span className="text-text-secondary">Maintain a neutral expression with a closed mouth. Keep your head straight (no tilting), and ensure both ears are visible if possible. Stand at least 3 feet away from the background.</span>
              </div>
            </li>
            <li className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-white dark:bg-black border border-border flex items-center justify-center shrink-0">👓</div>
              <div>
                <strong className="text-text-primary block">Glasses and Accessories</strong>
                <span className="text-text-secondary">Most countries no longer allow glasses in passport photos due to glare and frame shadows. Remove heavy jewelry, hats, and headphones. Religious headwear is generally permitted if it reveals the face.</span>
              </div>
            </li>
          </ul>
        </div>
      </section>

      <AdSlot adSlot="seo-bottom-slot" />

      {/* Internal Linking / Related Tools */}
      {relatedTools && relatedTools.length > 0 && (
        <section className="bg-bg-secondary border border-border rounded-[14px] p-6 shadow-sm">
          <h2 className="text-xl font-bold mb-4">Explore More Free Image Utilities</h2>
          <p className="text-sm text-text-secondary mb-4">Are your image file sizes too large for government upload portals? Use our related {categoryName} tools:</p>
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
            <h3 className="font-bold text-lg mb-2 text-text-primary">1. Is this passport photo maker truly free?</h3>
            <p className="text-text-secondary">Yes. Our tool is 100% free with no hidden charges. We do not require payment to remove watermarks or to download high-resolution HD printable files.</p>
          </div>
          <div className="bg-surface border border-border rounded-[16px] p-6 shadow-sm hover:border-accent/30 transition-colors">
            <h3 className="font-bold text-lg mb-2 text-text-primary">2. Will this photo be accepted by government agencies?</h3>
            <p className="text-text-secondary">If you follow our lighting and posture guidelines, and select the correct dimensions for your target country, your photo will be highly compliant. However, always double-check the final image against your specific government portal's requirements before submission.</p>
          </div>
          <div className="bg-surface border border-border rounded-[16px] p-6 shadow-sm hover:border-accent/30 transition-colors">
            <h3 className="font-bold text-lg mb-2 text-text-primary">3. Does the HD background remover cost money?</h3>
            <p className="text-text-secondary">No. Our embedded AI background remover is completely free. We process the image using modern web APIs to isolate your person and replace the original background with a clean white or blue background natively.</p>
          </div>
          <div className="bg-surface border border-border rounded-[16px] p-6 shadow-sm hover:border-accent/30 transition-colors">
            <h3 className="font-bold text-lg mb-2 text-text-primary">4. How do I print the photos at a local pharmacy?</h3>
            <p className="text-text-secondary">Once you finish cropping, select the option to export as a 4x6 inch printable sheet (or A4). Download the JPG, send it to your local CVS, Walgreens, or Walmart photo center, and pay pennies for a standard 4x6 print instead of $15+ for their passport service.</p>
          </div>
          <div className="bg-surface border border-border rounded-[16px] p-6 shadow-sm hover:border-accent/30 transition-colors">
            <h3 className="font-bold text-lg mb-2 text-text-primary">5. What if the file size is too big for the online application?</h3>
            <p className="text-text-secondary">Many online visa portals require the photo to be under 240KB. If your generated photo exceeds this limit, you can use our free Image Resizer or Compressor tools (linked below) to perfectly match the file size requirement without losing quality.</p>
          </div>
          <div className="bg-surface border border-border rounded-[16px] p-6 shadow-sm hover:border-accent/30 transition-colors">
            <h3 className="font-bold text-lg mb-2 text-text-primary">6. Are my personal photos kept private?</h3>
            <p className="text-text-secondary">Absolutely. Unlike cloud-based background removers, our intelligent cropping and processing logic is executed securely within your browser sandbox. We do not store your face data on any servers.</p>
          </div>
          <div className="bg-surface border border-border rounded-[16px] p-6 shadow-sm hover:border-accent/30 transition-colors">
            <h3 className="font-bold text-lg mb-2 text-text-primary">7. What is the standard size for an Indian passport photo?</h3>
            <p className="text-text-secondary">The standard size for an Indian passport or visa photo is 2 inches by 2 inches (51mm x 51mm). For certain OCI and PAN card applications, slightly different dimensions might be required, which you can set customly in our tool.</p>
          </div>
          <div className="bg-surface border border-border rounded-[16px] p-6 shadow-sm hover:border-accent/30 transition-colors">
            <h3 className="font-bold text-lg mb-2 text-text-primary">8. Can I use a selfie from my phone?</h3>
            <p className="text-text-secondary">Yes, modern smartphones have excellent cameras. Just make sure the camera is held at eye level (ask a friend to take it if possible, or use a timer) so your shoulders appear square and proportional.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
