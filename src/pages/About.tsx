import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import SEO from '../components/SEO';

export default function About() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-16">
      <SEO 
        title="About Us - LoveYouTools" 
        description="Learn more about LoveYouTools, our mission, and why we build free online tools for everyone."
        url={window.location.href}
      />
      
      <Link to="/" className="inline-flex items-center gap-2 text-text-muted hover:text-accent mb-8 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Home
      </Link>

      <h1 className="text-4xl font-extrabold mb-8">About LoveYouTools</h1>
      <div className="prose prose-lg dark:prose-invert max-w-none space-y-6 text-text-secondary">
        <p>
          Welcome to <strong>LoveYouTools</strong>, your ultimate destination for free, fast, and secure online tools. 
          Our mission is simple: to provide high-quality digital utilities that help developers, creators, and everyday users 
          get their work done more efficiently.
        </p>
        
        <h2 className="text-2xl font-bold text-text-primary mt-12 mb-4">Why We Build This</h2>
        <p>
          The web is full of tools, but many are cluttered with intrusive ads, require forced signups, or process your 
          sensitive data on distant servers. We wanted to create a platform that respects your privacy and your time. 
          That's why most of our tools run entirely in your browser—your data never leaves your device.
        </p>

        <h2 className="text-2xl font-bold text-text-primary mt-12 mb-4">Our Core Values</h2>
        <ul className="list-disc pl-6 space-y-2">
          <li><strong>Privacy First:</strong> We prioritize client-side processing to keep your data safe.</li>
          <li><strong>100% Free:</strong> No hidden costs, no subscriptions, no limits.</li>
          <li><strong>Simplicity:</strong> Clean, intuitive interfaces designed for speed.</li>
          <li><strong>Quality:</strong> Tools that actually work and solve real problems.</li>
        </ul>

        <h2 className="text-2xl font-bold text-text-primary mt-12 mb-4">Join Our Journey</h2>
        <p>
          We are constantly adding new tools and improving existing ones. If you have a suggestion for a tool 
          or want to report a bug, feel free to reach out to us. Thank you for using LoveYouTools!
        </p>
      </div>
    </div>
  );
}
