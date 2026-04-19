import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import SEO from '../components/SEO';

export default function Privacy() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-16">
      <SEO 
        title="Privacy Policy - LoveyouTools" 
        description="Comprehensive privacy policy for LoveyouTools explaining data collection, cookies, and Google AdSense compliance."
        url={window.location.href}
      />
      
      <Link to="/" className="inline-flex items-center gap-2 text-text-muted hover:text-accent mb-8 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Home
      </Link>

      <h1 className="text-4xl font-extrabold mb-8">Privacy Policy</h1>
      <div className="prose prose-lg dark:prose-invert max-w-none space-y-6 text-text-secondary">
        <p className="text-sm text-text-muted italic">Last Updated: April 19, 2026</p>
        
        <p>
          At <strong>LoveyouTools</strong> (loveyoutools.in), accessible from https://loveyoutools.in/, one of our main priorities is the privacy of our visitors. This Privacy Policy document contains types of information that is collected and recorded by LoveyouTools and how we use it.
        </p>
        <p>
          If you have additional questions or require more information about our Privacy Policy, do not hesitate to contact us.
        </p>

        <h2 className="text-2xl font-bold text-text-primary mt-12 mb-4">1. Local Processing (No Uploads)</h2>
        <p>
          We pride ourselves on user privacy. The majority of the tools provided on LoveyouTools (e.g., Image Resizer, Word Counter) process data <strong>strictly locally within your web browser</strong>. This means your files, documents, and images are <strong>never</strong> uploaded to our servers. Your data never leaves your device during processing.
        </p>

        <h2 className="text-2xl font-bold text-text-primary mt-12 mb-4">2. Cookies and Web Beacons</h2>
        <p>
          Like any other website, LoveyouTools uses 'cookies'. These cookies are used to store information including visitors' preferences, and the pages on the website that the visitor accessed or visited. The information is used to optimize the users' experience by customizing our web page content based on visitors' browser type and/or other information.
        </p>

        <h2 className="text-2xl font-bold text-text-primary mt-12 mb-4">3. Google DoubleClick DART Cookie</h2>
        <p>
          Google is one of a third-party vendor on our site. It also uses cookies, known as DART cookies, to serve ads to our site visitors based upon their visit to www.loveyoutools.in and other sites on the internet. However, visitors may choose to decline the use of DART cookies by visiting the Google ad and content network Privacy Policy at the following URL – <a href="https://policies.google.com/technologies/ads" target="_blank" rel="noopener noreferrer">https://policies.google.com/technologies/ads</a>.
        </p>

        <h2 className="text-2xl font-bold text-text-primary mt-12 mb-4">4. Advertising Partners Privacy Policies</h2>
        <p>
          Third-party ad servers or ad networks uses technologies like cookies, JavaScript, or Web Beacons that are used in their respective advertisements and links that appear on LoveyouTools, which are sent directly to users' browser. They automatically receive your IP address when this occurs. These technologies are used to measure the effectiveness of their advertising campaigns and/or to personalize the advertising content that you see on websites that you visit.
        </p>
        <p>
          Note that LoveyouTools has no access to or control over these cookies that are used by third-party advertisers.
        </p>

        <h2 className="text-2xl font-bold text-text-primary mt-12 mb-4">5. CCPA Privacy Rights (Do Not Sell My Personal Information)</h2>
        <p>
          Under the CCPA, among other rights, California consumers have the right to request that a business that collects a consumer's personal data disclose the categories and specific pieces of personal data that a business has collected about consumers.
        </p>

        <h2 className="text-2xl font-bold text-text-primary mt-12 mb-4">6. GDPR Data Protection Rights</h2>
        <p>
          We would like to make sure you are fully aware of all of your data protection rights. Every user is entitled to the following:
          The right to access, The right to rectification, The right to erasure, The right to restrict processing, The right to object to processing, and The right to data portability.
        </p>

        <h2 className="text-2xl font-bold text-text-primary mt-12 mb-4">7. Children's Information</h2>
        <p>
          Another part of our priority is adding protection for children while using the internet. We encourage parents and guardians to observe, participate in, and/or monitor and guide their online activity.
        </p>

        <h2 className="text-2xl font-bold text-text-primary mt-12 mb-4">8. Consent</h2>
        <p>
          By using our website, you hereby consent to our Privacy Policy and agree to its Terms and Conditions.
        </p>
      </div>
    </div>
  );
}
