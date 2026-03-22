import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import SEO from '../components/SEO';

export default function Terms() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-16">
      <SEO 
        title="Terms of Service - LoveyouTools" 
        description="Read our terms of service to understand the rules and regulations for using LoveyouTools."
        url={window.location.href}
      />
      
      <Link to="/" className="inline-flex items-center gap-2 text-text-muted hover:text-accent mb-8 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Home
      </Link>

      <h1 className="text-4xl font-extrabold mb-8">Terms of Service</h1>
      <div className="prose prose-lg dark:prose-invert max-w-none space-y-6 text-text-secondary">
        <p className="text-sm text-text-muted italic">Last Updated: March 13, 2026</p>

        <h2 className="text-2xl font-bold text-text-primary mt-12 mb-4">1. Terms</h2>
        <p>
          By accessing the website at loveyoutools.com, you are agreeing to be bound by these terms of service, 
          all applicable laws and regulations, and agree that you are responsible for compliance with any applicable local laws.
        </p>

        <h2 className="text-2xl font-bold text-text-primary mt-12 mb-4">2. Use License</h2>
        <p>
          Permission is granted to temporarily use the tools on LoveyouTools's website for personal, non-commercial transitory viewing only. 
          This is the grant of a license, not a transfer of title, and under this license you may not:
        </p>
        <ul className="list-disc pl-6 space-y-2">
          <li>Modify or copy the materials;</li>
          <li>Use the materials for any commercial purpose, or for any public display (commercial or non-commercial);</li>
          <li>Attempt to decompile or reverse engineer any software contained on LoveyouTools's website;</li>
          <li>Remove any copyright or other proprietary notations from the materials; or</li>
          <li>Transfer the materials to another person or "mirror" the materials on any other server.</li>
        </ul>

        <h2 className="text-2xl font-bold text-text-primary mt-12 mb-4">3. Disclaimer</h2>
        <p>
          The materials on LoveyouTools's website are provided on an 'as is' basis. LoveyouTools makes no warranties, 
          expressed or implied, and hereby disclaims and negates all other warranties including, without limitation, 
          implied warranties or conditions of merchantability, fitness for a particular purpose, or non-infringement 
          of intellectual property or other violation of rights.
        </p>

        <h2 className="text-2xl font-bold text-text-primary mt-12 mb-4">4. Limitations</h2>
        <p>
          In no event shall LoveyouTools or its suppliers be liable for any damages (including, without limitation, 
          damages for loss of data or profit, or due to business interruption) arising out of the use or inability 
          to use the materials on LoveyouTools's website.
        </p>

        <h2 className="text-2xl font-bold text-text-primary mt-12 mb-4">5. Governing Law</h2>
        <p>
          These terms and conditions are governed by and construed in accordance with the laws of India 
          and you irrevocably submit to the exclusive jurisdiction of the courts in that State or location.
        </p>
      </div>
    </div>
  );
}
